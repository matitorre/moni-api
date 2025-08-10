import { FastifyInstance } from "fastify";
import { CreateTransactionSchema } from "../schemas/transaction";
import { supabaseAdmin } from "../supabase";

export async function agentRoutes(app: FastifyInstance) {
  app.post("/v1/transactions/agent", async (req, reply) => {
    const apiKey = req.headers["x-api-key"];
    if (apiKey !== process.env.AGENT_API_KEY) return reply.code(401).send({ error: "unauthorized" });

    const parsed = CreateTransactionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload", details: parsed.error.flatten() });

    const { userId, ...payload } = parsed.data;
    if (!userId) return reply.code(400).send({ error: "missing_user" });

    const { data, error } = await supabaseAdmin.rpc("create_transaction_with_conversion", {
      p_user_id: userId,
      p_transaction_type: payload.transaction_type,
      p_origin_account_id: payload.origin_account_id,
      p_destination_account_id: payload.destination_account_id ?? null,
      p_category_id: payload.category_id ?? null,
      p_amount: payload.amount,
      p_description: payload.description ?? null,
      p_transaction_date: payload.transaction_date,
    }).single();

    if (error) return reply.code(400).send({ error: error.message });
    return reply.code(201).send({ transaction: data });
  });
} 