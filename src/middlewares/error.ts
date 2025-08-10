import { FastifyInstance } from "fastify";
export function errorHandler(app: any) {
  app.setErrorHandler((err: any, _req: any, reply: any) => {
    app.log.error({ err });
    const status = err.statusCode ?? 500;
    const normalized = typeof err.message === "string" ? err.message : "INTERNAL";
    reply.status(status).send({ error: normalized, code: err.code });
  });
} 