import { FastifyReply, FastifyRequest } from "fastify";
import { supabaseAdmin } from "../supabase";
import { env } from "../env";

type IdempotencyStatus = "in_progress" | "completed" | "failed";

export async function ensureIdempotency(req: FastifyRequest, reply: FastifyReply) {
  const key = req.headers["idempotency-key"];
  if (!key || typeof key !== "string") {
    return reply.code(400).send({ error: "IDEMPOTENCY_KEY_REQUIRED" });
  }

  const route = "/v1/transactions"; // target route
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    return reply.code(401).send({ error: "UNAUTHORIZED" });
  }

  // We'll first try the new schema. If it fails with PGRST204 (missing 'route'), fallback to legacy mode.

  // New schema flow: Try insert new key as in_progress
  let insertRes = await supabaseAdmin
    .from("idempotency_keys")
    .insert({ user_id: userId, key, route, status: "in_progress" as IdempotencyStatus })
    .select("status, response_body, status_code")
    .maybeSingle();

  // Fallback to legacy mode if missing 'route' column
  if (insertRes.error && insertRes.error.code === "PGRST204") {
    const { data: legacyExisting, error: legacyReadErr } = await supabaseAdmin
      .from("idempotency_keys")
      .select("response_body,status_code")
      .eq("key", key)
      .eq("path", route)
      .maybeSingle();

    if (!legacyReadErr && legacyExisting) {
      return reply.code(legacyExisting.status_code ?? 200).send(legacyExisting.response_body);
    }

    const originalSend = reply.send.bind(reply);
    (reply as any).send = async (payload: any) => {
      try {
        await supabaseAdmin
          .from("idempotency_keys")
          .insert({ key, path: route, status_code: reply.statusCode, response_body: payload });
      } catch (e) {
        req.log.error({ e }, "idempotency legacy persist error");
      }
      return (originalSend as any)(payload);
    };
    return; // continue to handler
  }

  if (insertRes.error && insertRes.error.code !== "23505") {
    req.log.error({ error: insertRes.error }, "idempotency insert error");
    return reply.code(500).send({ error: "INTERNAL" });
  }

  if (insertRes.data) {
    // fresh in_progress record; wrap reply.send to finalize later
    const originalSend = reply.send.bind(reply);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (reply as any).send = async (payload: any) => {
      const statusCode = reply.statusCode;
      const statusToSet: IdempotencyStatus = statusCode >= 400 ? "failed" : "completed";
      try {
        await supabaseAdmin
          .from("idempotency_keys")
          .update({ status: statusToSet, response_body: payload, status_code: statusCode })
          .eq("user_id", userId)
          .eq("key", key)
          .eq("route", route);
      } catch (e) {
        req.log.error({ e }, "idempotency finalize error");
      }
      return (originalSend as any)(payload);
    };
    return; // continue to handler
  }

  // Conflict (unique violation): fetch and decide
  const { data: existing, error: readErr } = await supabaseAdmin
    .from("idempotency_keys")
    .select("status, response_body, status_code")
    .eq("user_id", userId)
    .eq("key", key)
    .eq("route", route)
    .maybeSingle();

  if (readErr || !existing) {
    req.log.error({ error: readErr }, "idempotency read after conflict error");
    return reply.code(500).send({ error: "INTERNAL" });
  }

  if (existing.status === "completed") {
    return reply.code(existing.status_code ?? 201).send(existing.response_body);
  }
  if (existing.status === "in_progress") {
    return reply.code(409).send({ error: "IN_PROGRESS" });
  }
  // failed
  return reply.code(409).send({ error: "RETRY_LATER" });
}