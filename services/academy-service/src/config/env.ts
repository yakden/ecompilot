// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — academy-service / config/env.ts
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

  AWS_ACCESS_KEY_ID: z
    .string()
    .min(1)
    .describe("AWS IAM access key ID"),

  AWS_SECRET_ACCESS_KEY: z
    .string()
    .min(1)
    .describe("AWS IAM secret access key"),

  AWS_S3_BUCKET: z
    .string()
    .min(3)
    .describe("S3 bucket name for video storage"),

  AWS_REGION: z
    .string()
    .min(1)
    .default("eu-central-1")
    .describe("AWS region (e.g. eu-central-1)"),

  CLOUDFRONT_DOMAIN: z
    .string()
    .min(1)
    .describe("CloudFront distribution domain (e.g. d1234.cloudfront.net)"),

  CLOUDFRONT_KEY_PAIR_ID: z
    .string()
    .min(1)
    .describe("CloudFront key pair ID for signed URLs"),

  CLOUDFRONT_PRIVATE_KEY: z
    .string()
    .min(1)
    .describe("CloudFront RSA private key PEM for signing (newlines as \\n)"),

  PORT: z
    .string()
    .default("3009")
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
      `[academy-service] Environment validation failed:\n${issues}\n\nEnsure all required variables are set in your .env file.`,
    );
  }

  return result.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton — parse once at module load time
// ─────────────────────────────────────────────────────────────────────────────

export const env: Env = parseEnv();
