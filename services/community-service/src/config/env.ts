// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — community-service: Environment configuration
// Zod-validated: crashes fast on missing or malformed env vars
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

const EnvSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // NATS
  NATS_URL: z.string().min(1),

  // OpenAI — for content moderation
  OPENAI_API_KEY: z.string().min(1),

  // CORS — comma-separated list of allowed origins
  ALLOWED_ORIGINS: z.string().min(1),

  // Server
  PORT: z
    .string()
    .default("3000")
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().positive()),

  // Optional
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }
  return result.data;
}

// Singleton — parsed once at module load time
export const env: Env = parseEnv();

/** Parse ALLOWED_ORIGINS comma-separated string into array */
export function getAllowedOrigins(): string[] {
  return env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
}
