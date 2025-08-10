import 'dotenv/config';

export const env = {
  PORT: parseInt(process.env.PORT || "8080", 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  IDEMPOTENCY_TTL_SECONDS: parseInt(process.env.IDEMPOTENCY_TTL_SECONDS || "86400", 10),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || "60", 10),
  RATE_LIMIT_TIME_WINDOW: parseInt(process.env.RATE_LIMIT_TIME_WINDOW || "60000", 10),
}; 