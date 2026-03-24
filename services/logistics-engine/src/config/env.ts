// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — logistics-engine
// Environment configuration — validated at startup via Zod
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

const EnvSchema = z.object({
  // ── Server ─────────────────────────────────────────────────────────────────
  PORT: z
    .string()
    .default("3010")
    .transform((v) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 65535) {
        throw new Error(`PORT must be a valid TCP port number, got: ${v}`);
      }
      return n;
    }),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // ── PostgreSQL ─────────────────────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .url()
    .refine((u) => u.startsWith("postgres://") || u.startsWith("postgresql://"), {
      message: "DATABASE_URL must be a PostgreSQL connection string",
    }),

  // ── Redis ──────────────────────────────────────────────────────────────────
  REDIS_URL: z
    .string()
    .url()
    .refine((u) => u.startsWith("redis://") || u.startsWith("rediss://"), {
      message: "REDIS_URL must be a Redis connection string",
    }),

  // ── NATS ───────────────────────────────────────────────────────────────────
  NATS_URL: z
    .string()
    .refine((u) => u.startsWith("nats://") || u.startsWith("tls://"), {
      message: "NATS_URL must start with nats:// or tls://",
    }),

  // ── AWS S3 (label storage) ─────────────────────────────────────────────────
  AWS_S3_BUCKET: z.string().min(3).max(63),
  AWS_REGION: z
    .string()
    .regex(/^[a-z]{2}-[a-z]+-\d+$/, {
      message: "AWS_REGION must be a valid AWS region (e.g. eu-central-1)",
    }),
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),

  // ── Encryption (PII at rest) ───────────────────────────────────────────────
  PII_ENCRYPTION_KEY: z
    .string()
    .length(64, { message: "PII_ENCRYPTION_KEY must be 64 hex characters (256-bit key)" })
    .regex(/^[0-9a-fA-F]+$/, { message: "PII_ENCRYPTION_KEY must be a hex string" })
    .optional(),

  // ── BullMQ ─────────────────────────────────────────────────────────────────
  TRACKING_POLL_CONCURRENCY: z
    .string()
    .default("5")
    .transform(Number),

  // ── InPost ─────────────────────────────────────────────────────────────────
  INPOST_API_TOKEN: z.string().min(1).optional(),
  INPOST_ORGANIZATION_ID: z.string().min(1).optional(),
  INPOST_API_BASE_URL: z
    .string()
    .url()
    .default("https://api-shipx-pl.easypack24.net"),

  // ── DPD ────────────────────────────────────────────────────────────────────
  DPD_LOGIN: z.string().optional(),
  DPD_PASSWORD: z.string().optional(),
  DPD_FID: z.string().optional(),

  // ── DHL ────────────────────────────────────────────────────────────────────
  DHL_API_KEY: z.string().optional(),
  DHL_API_SECRET: z.string().optional(),
  DHL24_ACCOUNT_ID: z.string().optional(),

  // ── Circuit Breaker ────────────────────────────────────────────────────────
  CB_FAILURE_THRESHOLD: z
    .string()
    .default("5")
    .transform(Number),
  CB_RECOVERY_TIMEOUT_MS: z
    .string()
    .default("30000")
    .transform(Number),
  CB_SUCCESS_THRESHOLD: z
    .string()
    .default("2")
    .transform(Number),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`[logistics-engine] Environment validation failed:\n${formatted}`);
  }
  return result.data;
}

export const env: Env = loadEnv();
