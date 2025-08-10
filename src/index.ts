import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./env";
import { logger } from "./logger";
import { errorHandler } from "./middlewares/error";
import { rateLimitPlugin } from "./middlewares/rateLimit";
import { ensureIdempotency } from "./middlewares/idempotency";
import { healthRoutes } from "./routes/health";
import { transactionRoutes } from "./routes/transactions";
import { agentRoutes } from "./routes/agent";
import { authHook } from "./middlewares/jwtAuth";
import { accountRoutes } from "./routes/accounts";
import { categoryRoutes } from "./routes/categories";
import { dashboardRoutes } from "./routes/dashboard";

const app: any = Fastify({ logger });

await app.register(cors, {
  origin: env.CORS_ORIGIN,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
  credentials: false,
  preflightContinue: false,
  strictPreflight: true,
});
await rateLimitPlugin(app);
errorHandler(app);

// auth global (salvo salud y agent); y luego idempotencia para POST /v1/transactions
app.addHook("onRequest", authHook);
app.addHook("preHandler", async (req: any, reply: any) => {
  // Permitir desactivar idempotencia temporalmente con variable de entorno
  const idmpDisabled = process.env.IDEMPOTENCY_DISABLED === "1";
  const routeUrl = (req as any).routeOptions?.url || (req as any).routerPath;
  if (!idmpDisabled && req.method === "POST" && routeUrl === "/v1/transactions") {
    await ensureIdempotency(req, reply);
  }
});

// rutas
await healthRoutes(app);
await transactionRoutes(app);
await agentRoutes(app);
await accountRoutes(app);
await categoryRoutes(app);
await dashboardRoutes(app);

app.listen({ port: env.PORT, host: "0.0.0.0" })
  .then(() => app.log.info(`moni-api up on :${env.PORT}`))
  .catch((err: any) => { app.log.error(err); process.exit(1); });