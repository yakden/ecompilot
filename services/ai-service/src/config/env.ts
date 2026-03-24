// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — ai-service / config/env.ts
// Zod-validated environment configuration
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

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
    .min(1)
    .describe("NATS server URL (nats://host:port)"),

  OPENAI_API_KEY: z
    .string()
    .min(1)
    .describe("OpenAI API key"),

  PINECONE_API_KEY: z
    .string()
    .min(1)
    .describe("Pinecone API key"),

  PINECONE_INDEX: z
    .string()
    .min(1)
    .default("ecompilot-knowledge")
    .describe("Pinecone index name"),

  PORT: z
    .string()
    .default("3007")
    .transform((val) => {
      const parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error(`Invalid PORT value: ${val}`);
      }
      return parsed;
    })
    .describe("HTTP server port"),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  JWT_SECRET: z
    .string()
    .min(32)
    .describe("JWT signing secret (min 32 chars)"),

  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Inferred type
// ─────────────────────────────────────────────────────────────────────────────

export type Env = z.infer<typeof EnvSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Parse & validate — throws with structured error on failure
// ─────────────────────────────────────────────────────────────────────────────

function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `[ai-service] Environment validation failed:\n${issues}\n\nEnsure all required variables are set in your .env file.`,
    );
  }

  return result.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton — parse once at module load time
// ─────────────────────────────────────────────────────────────────────────────

export const env: Env = parseEnv();
