// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — auth-service: Environment configuration
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

  // JWT — RS256 keys (PEM format, newlines encoded as \n in env)
  JWT_PRIVATE_KEY: z.string().min(1),
  JWT_PUBLIC_KEY: z.string().min(1),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  // OAuth — Google
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  // Encryption — AES-256-GCM key for user API key storage (64 hex chars = 32 bytes)
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be 64 hex characters (32 bytes)"),

  // Email — Resend
  RESEND_API_KEY: z.string().min(1),

  // Application
  APP_URL: z.string().url(),
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
    // Crash fast — invalid config is a fatal startup error
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

/** Decode PEM key from env (handles literal \n → actual newlines) */
export function decodePemKey(raw: string): string {
  return raw.replace(/\\n/g, "\n");
}
