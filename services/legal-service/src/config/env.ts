// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — legal-service / config / env
// Validates and exports typed environment variables via Zod
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .url()
    .describe("PostgreSQL connection URL (postgres://user:pass@host:5432/db)"),
  REDIS_URL: z
    .string()
    .min(1)
    .url()
    .describe("Redis connection URL (redis://host:6379)"),
  PORT: z
    .string()
    .default("3009")
    .transform((v) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 65535) {
        throw new Error(`PORT must be an integer between 1 and 65535, got: ${v}`);
      }
      return n;
    }),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`[legal-service] Environment validation failed:\n${formatted}`);
  }
  return result.data;
}

export const env: Env = parseEnv();
