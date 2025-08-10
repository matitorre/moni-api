import { FastifyInstance } from "fastify";
import { createUserSupabaseClient } from "../supabase";

export async function accountRoutes(app: FastifyInstance) {
  app.get("/v1/accounts", async (req, reply) => {
    const jwt = (req.headers["authorization"] as string).replace(/^Bearer\s+/i, "");
    const supabase = createUserSupabaseClient(jwt);

    const activeOnly = (req.query as any).activeOnly === "true";

    let query = supabase.from("accounts").select("id,user_id,name,account_type,currency,initial_balance,current_balance,is_active,created_at,updated_at");
    if (activeOnly) query = query.eq("is_active", true);
    query = query.order("created_at", { ascending: true });

    const { data, error } = await query;
    if (error) return reply.code(400).send({ error: error.message });
    return reply.code(200).send({ accounts: data });
  });

  // POST /v1/accounts
  app.post("/v1/accounts", async (req, reply) => {
    const userIdFromToken = (req as any).userId as string | undefined;
    if (!userIdFromToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const body = (req.body as any) || {};
    const { name, account_type, currency, initial_balance = 0, is_active = true } = body;
    if (!name || !account_type || !currency) {
      return reply.code(400).send({ error: "INVALID_PAYLOAD" });
    }

    const jwt = (req.headers["authorization"] as string).replace(/^Bearer\s+/i, "");
    const supabase = createUserSupabaseClient(jwt);

    // Usar la RPC que maneja creación con saldo inicial
    const { data: result, error: rpcError } = await supabase.rpc('create_account_with_initial_balance', {
      p_user_id: userIdFromToken,
      p_name: name,
      p_account_type: account_type,
      p_currency: currency,
      p_initial_balance: Number(initial_balance) || 0,
      p_is_active: !!is_active,
    });

    if (rpcError) return reply.code(400).send({ error: rpcError.message });

    // Obtener la cuenta creada para devolverla
    const { data: account, error: fetchErr } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', result?.account_id)
      .single();
    if (fetchErr) return reply.code(400).send({ error: fetchErr.message });

    return reply.code(201).send({ account });
  });

  // PUT /v1/accounts/:id
  app.put("/v1/accounts/:id", async (req, reply) => {
    const userIdFromToken = (req as any).userId as string | undefined;
    if (!userIdFromToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const body = (req.body as any) || {};
    const allowed: any = {};
    if (typeof body.name === 'string') allowed.name = body.name;
    if (typeof body.account_type === 'string') allowed.account_type = body.account_type;
    if (typeof body.is_active === 'boolean') allowed.is_active = body.is_active;

    if (Object.keys(allowed).length === 0) {
      return reply.code(400).send({ error: "NOTHING_TO_UPDATE" });
    }

    const jwt = (req.headers["authorization"] as string).replace(/^Bearer\s+/i, "");
    const supabase = createUserSupabaseClient(jwt);

    const { data, error } = await supabase
      .from('accounts')
      .update(allowed)
      .eq('id', (req.params as any).id)
      .eq('user_id', userIdFromToken)
      .select('*')
      .single();
    if (error) return reply.code(400).send({ error: error.message });
    return reply.code(200).send({ account: data });
  });

  // DELETE /v1/accounts/:id → usa RPC existente para determinar si requiere transferencia
  app.delete("/v1/accounts/:id", async (req, reply) => {
    const userIdFromToken = (req as any).userId as string | undefined;
    if (!userIdFromToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const jwt = (req.headers["authorization"] as string).replace(/^Bearer\s+/i, "");
    const supabase = createUserSupabaseClient(jwt);

    const accountId = (req.params as any).id as string;
    const { data, error } = await supabase.rpc('delete_account_with_transfer', {
      p_user_id: userIdFromToken,
      p_account_id: accountId,
      p_target_account_id: null,
    });

    if (error) return reply.code(400).send({ error: error.message });
    return reply.code(200).send({ data });
  });

  // POST /v1/accounts/:id/delete-with-transfer { targetAccountId }
  app.post("/v1/accounts/:id/delete-with-transfer", async (req, reply) => {
    const userIdFromToken = (req as any).userId as string | undefined;
    if (!userIdFromToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const jwt = (req.headers["authorization"] as string).replace(/^Bearer\s+/i, "");
    const supabase = createUserSupabaseClient(jwt);

    const accountId = (req.params as any).id as string;
    const targetAccountId = (req.body as any)?.targetAccountId as string | undefined;
    if (!targetAccountId) return reply.code(400).send({ error: "TARGET_REQUIRED" });

    const { data, error } = await supabase.rpc('delete_account_with_transfer', {
      p_user_id: userIdFromToken,
      p_account_id: accountId,
      p_target_account_id: targetAccountId,
    });

    if (error) return reply.code(400).send({ error: error.message });
    return reply.code(200).send({ data });
  });
}


