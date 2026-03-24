// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — billing-service: Environment configuration
// Zod-validated: crashes fast on missing or malformed env vars
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

const EnvSchema = z.object({
  // ── Database ────────────────────────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .url()
    .startsWith("postgresql://", {
      message: "DATABASE_URL must be a PostgreSQL connection string (postgresql://...)",
    }),

  // ── NATS JetStream ──────────────────────────────────────────────────────────
  NATS_URL: z
    .string()
    .min(1)
    .startsWith("nats://", {
      message: "NATS_URL must be a NATS connection string (nats://...)",
    }),

  // ── Stripe ──────────────────────────────────────────────────────────────────
  STRIPE_SECRET_KEY: z
    .string()
    .min(1)
    .startsWith("sk_", {
      message: "STRIPE_SECRET_KEY must begin with sk_ (live or test key)",
    }),

  STRIPE_WEBHOOK_SECRET: z
    .string()
    .min(1)
    .startsWith("whsec_", {
      message: "STRIPE_WEBHOOK_SECRET must begin with whsec_",
    }),

  // ── Stripe Price IDs ─────────────────────────────────────────────────────────
  STRIPE_PRO_MONTHLY_PRICE_ID: z
    .string()
    .min(1)
    .startsWith("price_", {
      message: "STRIPE_PRO_MONTHLY_PRICE_ID must be a Stripe price ID (price_...)",
    }),

  STRIPE_PRO_YEARLY_PRICE_ID: z
    .string()
    .min(1)
    .startsWith("price_", {
      message: "STRIPE_PRO_YEARLY_PRICE_ID must be a Stripe price ID (price_...)",
    }),

  STRIPE_BUSINESS_MONTHLY_PRICE_ID: z
    .string()
    .min(1)
    .startsWith("price_", {
      message: "STRIPE_BUSINESS_MONTHLY_PRICE_ID must be a Stripe price ID (price_...)",
    }),

  STRIPE_BUSINESS_YEARLY_PRICE_ID: z
    .string()
    .min(1)
    .startsWith("price_", {
      message: "STRIPE_BUSINESS_YEARLY_PRICE_ID must be a Stripe price ID (price_...)",
    }),

  // ── Application ──────────────────────────────────────────────────────────────
  APP_URL: z.string().url({
    message: "APP_URL must be a valid URL (e.g. https://app.ecompilot.pl)",
  }),

  // ── Server ───────────────────────────────────────────────────────────────────
  PORT: z
    .string()
    .default("3007")
    .transform((val) => {
      const parsed = Number(val);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error("PORT must be an integer between 1 and 65535");
      }
      return parsed;
    }),

  HOST: z.string().default("0.0.0.0"),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  LOG_LEVEL: z.string().default("info"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Inferred type & singleton
// ─────────────────────────────────────────────────────────────────────────────

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    // Crash fast — missing or malformed config is always a fatal startup error
    throw new Error(`Environment validation failed:\n${formatted}`);
  }

  return result.data;
}

// Parsed once at module load; all imports share the same validated object
export const env: Env = loadEnv();
