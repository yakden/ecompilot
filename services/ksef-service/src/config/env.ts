// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — ksef-service: Environment configuration
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

  // ── Redis ───────────────────────────────────────────────────────────────────
  REDIS_URL: z
    .string()
    .min(1)
    .startsWith("redis://", {
      message: "REDIS_URL must be a Redis connection string (redis://...)",
    }),

  // ── NATS JetStream ──────────────────────────────────────────────────────────
  NATS_URL: z
    .string()
    .min(1)
    .startsWith("nats://", {
      message: "NATS_URL must be a NATS connection string (nats://...)",
    }),

  // ── KSeF ────────────────────────────────────────────────────────────────────
  // Target environment for KSeF API calls
  KSEF_ENVIRONMENT: z.enum(["test", "demo", "production"], {
    errorMap: () => ({
      message: "KSEF_ENVIRONMENT must be one of: test, demo, production",
    }),
  }),

  // NIP (Numer Identyfikacji Podatkowej) — 10-digit Polish tax ID of the seller
  KSEF_NIP: z
    .string()
    .regex(/^\d{10}$/, {
      message: "KSEF_NIP must be exactly 10 digits",
    }),

  // ── Server ───────────────────────────────────────────────────────────────────
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
