import { FastifyReply, FastifyRequest } from "fastify";
import { createUserSupabaseClient } from "../supabase";

export async function authHook(req: FastifyRequest, reply: FastifyReply) {
  // Allow unauthenticated routes
  if (req.method === "OPTIONS" || req.routerPath === "/health" || req.routerPath?.startsWith("/v1/transactions/agent")) {
    return;
  }

  const authHeader = req.headers["authorization"];
  if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "UNAUTHORIZED" });
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  const supabase = createUserSupabaseClient(jwt);
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data?.user) {
    return reply.code(401).send({ error: "UNAUTHORIZED" });
  }
  (req as any).userId = data.user.id;
}


