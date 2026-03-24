// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — marketplace-hub
// Environment configuration with Zod validation
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .startsWith("postgresql://", {
      message: "DATABASE_URL must be a PostgreSQL connection string",
    }),

  REDIS_URL: z
    .string()
    .url()
    .refine(
      (url) => url.startsWith("redis://") || url.startsWith("rediss://"),
      { message: "REDIS_URL must be a Redis connection string (redis:// or rediss://)" },
    ),

  NATS_URL: z
    .string()
    .url()
    .startsWith("nats://", {
      message: "NATS_URL must be a NATS connection string",
    }),

  PORT: z
    .string()
    .default("3010")
    .transform((val) => {
      const parsed = Number(val);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error("PORT must be an integer between 1 and 65535");
      }
      return parsed;
    }),

  HOST: z.string().default("0.0.0.0"),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // ── Allegro OAuth2 credentials ───────────────────────────────────────────
  ALLEGRO_CLIENT_ID: z.string().min(1, "ALLEGRO_CLIENT_ID is required"),
  ALLEGRO_CLIENT_SECRET: z.string().min(1, "ALLEGRO_CLIENT_SECRET is required"),
  ALLEGRO_REDIRECT_URI: z.string().url("ALLEGRO_REDIRECT_URI must be a valid URL"),
  /** Use sandbox endpoint in non-production environments */
  ALLEGRO_API_URL: z
    .string()
    .url()
    .default("https://api.allegro.pl"),
  ALLEGRO_OAUTH_URL: z
    .string()
    .url()
    .default("https://allegro.pl"),

  // ── Amazon SP-API credentials ─────────────────────────────────────────────
  AMAZON_LWA_CLIENT_ID: z.string().min(1).optional(),
  AMAZON_LWA_CLIENT_SECRET: z.string().min(1).optional(),
  AMAZON_LWA_REFRESH_TOKEN: z.string().min(1).optional(),
  AMAZON_AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AMAZON_AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  AMAZON_AWS_REGION: z.string().default("eu-west-1"),
  AMAZON_MARKETPLACE_ID: z.string().default("A1C3SOZRARQ6R3"), // Poland

  // ── Encryption key for PII and tokens at rest ─────────────────────────────
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"),

  // ── BullMQ / Worker config ────────────────────────────────────────────────
  POLLING_CONCURRENCY: z
    .string()
    .default("5")
    .transform((val) => Math.max(1, Number(val))),

  // ── Safety stock buffer (%) ───────────────────────────────────────────────
  SAFETY_STOCK_BUFFER_PCT: z
    .string()
    .default("10")
    .transform((val) => Math.max(0, Math.min(100, Number(val)))),
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation & export
// ─────────────────────────────────────────────────────────────────────────────

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${formatted}`);
  }

  return result.data;
}

// Singleton — validated once at module load
export const env: Env = loadEnv();
