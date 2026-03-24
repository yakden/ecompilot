// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — payment-reconciliation
// Environment variable validation with Zod
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

const EnvSchema = z.object({
  // ── Core infrastructure ────────────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith("postgres"), {
      message: "DATABASE_URL must be a PostgreSQL connection string",
    }),

  REDIS_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith("redis"), {
      message: "REDIS_URL must be a Redis connection string",
    }),

  NATS_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith("nats"), {
      message: "NATS_URL must be a NATS connection string",
    }),

  PORT: z
    .string()
    .regex(/^\d+$/, "PORT must be a numeric string")
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535))
    .default("3008"),

  HOST: z.string().default("0.0.0.0"),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // ── Przelewy24 ────────────────────────────────────────────────────────────
  P24_MERCHANT_ID: z.string().min(1).optional(),
  P24_POS_ID: z.string().min(1).optional(),
  P24_CRC_KEY: z.string().min(1).optional(),
  P24_REPORT_KEY: z.string().min(1).optional(),
  P24_SANDBOX: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  // ── Paynow ────────────────────────────────────────────────────────────────
  PAYNOW_API_KEY: z.string().min(1).optional(),
  PAYNOW_SIGNATURE_KEY: z.string().min(1).optional(),
  PAYNOW_SANDBOX: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  // ── PayU ──────────────────────────────────────────────────────────────────
  PAYU_CLIENT_ID: z.string().min(1).optional(),
  PAYU_CLIENT_SECRET: z.string().min(1).optional(),
  PAYU_POS_ID: z.string().min(1).optional(),
  PAYU_SANDBOX: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  // ── Tpay ──────────────────────────────────────────────────────────────────
  TPAY_CLIENT_ID: z.string().min(1).optional(),
  TPAY_CLIENT_SECRET: z.string().min(1).optional(),
  TPAY_MERCHANT_EMAIL: z.string().email().optional(),
  TPAY_SANDBOX: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  // ── imoje (ING Bank) ──────────────────────────────────────────────────────
  IMOJE_SERVICE_ID: z.string().min(1).optional(),
  IMOJE_SERVICE_KEY: z.string().min(1).optional(),
  IMOJE_MERCHANT_ID: z.string().min(1).optional(),
  IMOJE_SANDBOX: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  // ── Webhook base URL (for generating return/notify URLs) ──────────────────
  SERVICE_BASE_URL: z
    .string()
    .url()
    .default("http://localhost:3008"),

  // ── Encryption key for gateway credentials at rest ────────────────────────
  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .length(64, "Must be 64 hex chars (32-byte AES-256 key)")
    .optional(),
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

// Singleton — parse once at module load time so startup fails fast
export const env: Env = parseEnv();
