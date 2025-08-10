import { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { env } from "../env";

export async function rateLimitPlugin(app: any) {
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_TIME_WINDOW
  });
} 