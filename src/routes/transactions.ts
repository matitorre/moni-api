import { FastifyInstance } from "fastify";
import { CreateTransactionSchema, UpdateTransactionSchema } from "../schemas/transaction";
import { createUserSupabaseClient } from "../supabase";

export async function transactionRoutes(app: FastifyInstance) {
  // GET /v1/transactions
  app.get("/v1/transactions", async (req, reply) => {
    const userIdFromToken = (req as any).userId as string | undefined;
    if (!userIdFromToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const jwt = (req.headers["authorization"] as string).replace(/^Bearer\s+/i, "");
    const supabase = createUserSupabaseClient(jwt);

    const { dateFrom, dateTo, type, originCurrency, limit, offset } = (req.query as any) || {};
    const pageSize = Math.min(parseInt(limit ?? "100", 10) || 100, 500);
    const pageOffset = Math.max(parseInt(offset ?? "0", 10) || 0, 0);

    let query = supabase
      .from("transactions")
      .select("*", { count: "exact" })
      .eq("user_id", userIdFromToken);

    if (dateFrom) query = query.gte("transaction_date", String(dateFrom));
    if (dateTo) query = query.lte("transaction_date", String(dateTo));
    if (type) query = query.eq("transaction_type", String(type));
    if (originCurrency) query = query.eq("origin_currency_local", String(originCurrency));

    query = query.order("transaction_date", { ascending: false }).range(pageOffset, pageOffset + pageSize - 1);

    const { data, error, count } = await query;
    if (error) return reply.code(400).send({ error: error.message });

    const { count: totalCount, error: totalErr } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userIdFromToken);

    if (totalErr) return reply.code(400).send({ error: totalErr.message });

    return reply.code(200).send({
      transactions: data ?? [],
      filteredCount: count ?? 0,
      totalCount: totalCount ?? 0,
      limit: pageSize,
      offset: pageOffset,
    });
  });
  // POST /v1/transactions
  app.post("/v1/transactions", async (req, reply) => {
    const parse = CreateTransactionSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: "INVALID_PAYLOAD" });

    const body = parse.data;
    const userIdFromToken = (req as any).userId as string | undefined;
    if (!userIdFromToken) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (body.userId && body.userId !== userIdFromToken) return reply.code(403).send({ error: "FORBIDDEN" });

    // domain validations
    if (!['income','expense','transfer'].includes(body.transaction_type)) return reply.code(400).send({ error: "INVALID_TRANSACTION_TYPE" });
    if (body.amount <= 0) return reply.code(400).send({ error: "INVALID_AMOUNT" });
    if (body.transaction_type === 'transfer' && !body.destination_account_id) return reply.code(400).send({ error: "DESTINATION_REQUIRED" });
    if ((body.transaction_type === 'income' || body.transaction_type === 'expense') && !body.category_id) return reply.code(400).send({ error: "CATEGORY_REQUIRED" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.transaction_date)) return reply.code(400).send({ error: "INVALID_DATE" });

    const jwt = (req.headers["authorization"] as string).replace(/^Bearer\s+/i, "");
    const supabase = createUserSupabaseClient(jwt);

    const { data, error } = await supabase.rpc("create_transaction_with_conversion", {
      p_user_id: userIdFromToken,
      p_transaction_type: body.transaction_type,
      p_origin_account_id: body.origin_account_id,
      p_destination_account_id: body.destination_account_id,
      p_category_id: body.category_id,
      p_amount: body.amount,
      p_description: body.description ?? null,
      p_transaction_date: body.transaction_date,
    }).single();

    if (error) {
      return reply.code(400).send({ error: error.message });
    }

    return reply.code(201).send({ transaction: data });
  });

  // PUT /v1/transactions/:id
  app.put("/v1/transactions/:id", async (req, reply) => {
    const parse = UpdateTransactionSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: "INVALID_PAYLOAD" });
    const body = parse.data;
    const userIdFromToken = (req as any).userId as string | undefined;
    if (!userIdFromToken) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (body.userId && body.userId !== userIdFromToken) return reply.code(403).send({ error: "FORBIDDEN" });

    const jwt = (req.headers["authorization"] as string).replace(/^Bearer\s+/i, "");
    const supabase = createUserSupabaseClient(jwt);

    const { data, error } = await supabase.functions.invoke("update-transaction-with-conversion", {
      body: {
        user_id: userIdFromToken,
        transaction_id: (req.params as any).id,
        transaction_type: body.transaction_type,
        origin_account_id: body.origin_account_id,
        destination_account_id: body.destination_account_id,
        category_id: body.category_id,
        amount_origin: body.amount,
        description: body.description,
        transaction_date: body.transaction_date,
      }
    });

    if (error) return reply.code(400).send({ error: error.message });
    return reply.code(200).send({ transaction: data });
  });

  // DELETE /v1/transactions/:id
  app.delete("/v1/transactions/:id", async (req, reply) => {
    const userIdFromToken = (req as any).userId as string | undefined;
    if (!userIdFromToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const jwt = (req.headers["authorization"] as string).replace(/^Bearer\s+/i, "");
    const supabase = createUserSupabaseClient(jwt);

    const { data, error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", (req.params as any).id)
      .eq("user_id", userIdFromToken)
      .select("*")
      .maybeSingle();

    if (error) return reply.code(400).send({ error: error.message });
    return reply.code(200).send({ transaction: data });
  });

  // POST /v1/transactions/:id/revert-auto-transfer
  app.post("/v1/transactions/:id/revert-auto-transfer", async (req, reply) => {
    const userIdFromToken = (req as any).userId as string | undefined;
    if (!userIdFromToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const jwt = (req.headers["authorization"] as string).replace(/^Bearer\s+/i, "");
    const supabase = createUserSupabaseClient(jwt);

    const txId = (req.params as any).id;
    const { data: transaction, error: fetchError } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", txId)
      .eq("user_id", userIdFromToken)
      .single();

    if (fetchError || !transaction) return reply.code(404).send({ error: "NOT_FOUND" });
    if (transaction.transaction_type !== 'transfer' || !transaction.description?.includes('Transferencia automática por eliminación de cuenta:')) {
      return reply.code(400).send({ error: "ONLY_AUTO_TRANSFER" });
    }

    // Obtener cuentas
    const { data: originAccount, error: originError } = await supabase
      .from("accounts").select("*")
      .eq("id", transaction.origin_account_id)
      .eq("user_id", userIdFromToken)
      .single();
    if (originError) return reply.code(400).send({ error: "ORIGIN_NOT_FOUND" });

    const { data: destinationAccount, error: destError } = await supabase
      .from("accounts").select("*")
      .eq("id", transaction.destination_account_id)
      .eq("user_id", userIdFromToken)
      .eq("is_active", true)
      .single();
    if (destError) return reply.code(400).send({ error: "DEST_NOT_FOUND_OR_INACTIVE" });

    // Reactivar origen si estaba inactiva
    if (!originAccount.is_active) {
      const { error: reactivateError } = await supabase
        .from("accounts")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", transaction.origin_account_id)
        .eq("user_id", userIdFromToken);
      if (reactivateError) return reply.code(400).send({ error: "REACTIVATE_ORIGIN_FAILED" });
    }

    // Corregir saldos
    const { error: updateDestError } = await supabase
      .from("accounts")
      .update({ current_balance: destinationAccount.current_balance - (transaction.amount_destination ?? 0), updated_at: new Date().toISOString() })
      .eq("id", transaction.destination_account_id)
      .eq("user_id", userIdFromToken);
    if (updateDestError) return reply.code(400).send({ error: "UPDATE_DEST_FAILED" });

    const { error: updateOriginError } = await supabase
      .from("accounts")
      .update({ current_balance: originAccount.current_balance + (transaction.amount_origin ?? 0), updated_at: new Date().toISOString() })
      .eq("id", transaction.origin_account_id)
      .eq("user_id", userIdFromToken);
    if (updateOriginError) return reply.code(400).send({ error: "UPDATE_ORIGIN_FAILED" });

    // Eliminar la transacción original
    const { error: deleteError } = await supabase
      .from("transactions")
      .delete()
      .eq("id", txId)
      .eq("user_id", userIdFromToken);
    if (deleteError) return reply.code(400).send({ error: "DELETE_TX_FAILED" });

    return reply.code(200).send({ success: true });
  });
}