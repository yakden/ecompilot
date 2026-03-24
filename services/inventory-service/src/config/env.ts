// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — inventory-service
// Environment configuration with Zod validation
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .describe("PostgreSQL connection string"),

  REDIS_URL: z
    .string()
    .url()
    .describe("Redis connection string"),

  NATS_URL: z
    .string()
    .url()
    .describe("NATS messaging server URL"),

  PORT: z
    .string()
    .regex(/^\d+$/, "PORT must be a numeric string")
    .transform((v) => Number(v))
    .pipe(z.number().int().min(1).max(65535))
    .default("3017"),

  HOST: z
    .string()
    .default("0.0.0.0"),

  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${formatted}`);
  }

  return result.data;
}

// Singleton — parsed once at module load, throws on bad config
export const env: Env = parseEnv();
