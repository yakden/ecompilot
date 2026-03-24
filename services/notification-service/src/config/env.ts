// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — notification-service: Environment configuration
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

  // Resend (email)
  RESEND_API_KEY: z.string().min(1),

  // Firebase Admin SDK (FCM push)
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_PRIVATE_KEY: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),

  // Server
  PORT: z
    .string()
    .default("3008")
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

/** Decode PEM key from env (handles literal \n → actual newlines) */
export function decodePemKey(raw: string): string {
  return raw.replace(/\\n/g, "\n");
}
