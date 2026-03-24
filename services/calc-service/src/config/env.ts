// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — calc-service
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

  PORT: z
    .string()
    .regex(/^\d+$/, "PORT must be a numeric string")
    .transform((v) => Number(v))
    .pipe(z.number().int().min(1).max(65535))
    .default("3004"),

  HOST: z
    .string()
    .default("0.0.0.0"),

  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  /**
   * GeoNames API username — register for free at https://www.geonames.org/login
   * Falls back to the shared "demo" account (limited quota).
   */
  GEONAMES_USERNAME: z
    .string()
    .min(1)
    .default("demo")
    .describe("GeoNames API username for postal code validation"),
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
