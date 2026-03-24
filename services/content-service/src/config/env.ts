// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — content-service
// Environment configuration validated with Zod at startup
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .describe("PostgreSQL connection URL"),

  REDIS_URL: z
    .string()
    .url()
    .describe("Redis connection URL (used by BullMQ)"),

  NATS_URL: z
    .string()
    .url()
    .describe("NATS JetStream server URL"),

  OPENAI_API_KEY: z
    .string()
    .min(1)
    .describe("OpenAI API key for GPT-4o and DALL-E 3"),

  AWS_ACCESS_KEY_ID: z
    .string()
    .min(1)
    .describe("AWS IAM access key"),

  AWS_SECRET_ACCESS_KEY: z
    .string()
    .min(1)
    .describe("AWS IAM secret key"),

  AWS_S3_BUCKET: z
    .string()
    .min(1)
    .describe("S3 bucket name for generated content"),

  AWS_REGION: z
    .string()
    .default("eu-central-1")
    .describe("AWS region (default: eu-central-1)"),

  CDN_URL: z
    .string()
    .url()
    .describe("CDN base URL for serving generated assets"),

  PORT: z
    .string()
    .default("3000")
    .transform((v) => {
      const port = parseInt(v, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid PORT value: ${v}`);
      }
      return port;
    })
    .describe("HTTP server port"),

  REMBG_SERVICE_URL: z
    .string()
    .url()
    .default("http://rembg-service:7000")
    .describe("URL of the rembg Python background removal service"),

  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  ICECAT_USERNAME: z
    .string()
    .min(1)
    .default("openicecat")
    .describe(
      "Icecat Open Catalog username (default: openicecat — public free tier). " +
      "Register at https://icecat.biz for higher rate limits.",
    ),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(
      `content-service: Invalid environment configuration:\n${formatted}`,
    );
  }

  return result.data;
}

// Parsed once at module load — will throw on misconfiguration before the
// server attempts to bind any ports.
export const env: Env = parseEnv();
