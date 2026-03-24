// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — analytics-service
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
    .startsWith("postgresql://", { message: "DATABASE_URL must be a PostgreSQL connection string" }),

  REDIS_URL: z
    .string()
    .url()
    .startsWith("redis", { message: "REDIS_URL must be a Redis connection string (redis:// or rediss://)" }),

  NATS_URL: z
    .string()
    .url()
    .startsWith("nats://", { message: "NATS_URL must be a NATS connection string" }),

  CLICKHOUSE_URL: z
    .string()
    .url()
    .refine(
      (url) => url.startsWith("http://") || url.startsWith("https://"),
      { message: "CLICKHOUSE_URL must be an HTTP/HTTPS URL" },
    ),

  PORT: z
    .string()
    .default("3006")
    .transform((val) => {
      const parsed = Number(val);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error("PORT must be an integer between 1 and 65535");
      }
      return parsed;
    }),

  HOST: z.string().default("0.0.0.0"),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Maximum concurrent Playwright scraper tasks */
  SCRAPER_CONCURRENCY: z
    .string()
    .default("3")
    .transform((val) => Math.max(1, Number(val))),

  /** BullMQ worker concurrency */
  WORKER_CONCURRENCY: z
    .string()
    .default("5")
    .transform((val) => Math.max(1, Number(val))),

  /** ClickHouse database name */
  CLICKHOUSE_DB: z.string().default("ecompilot_analytics"),

  /** ClickHouse credentials — must match docker-compose CLICKHOUSE_USER/PASSWORD */
  CLICKHOUSE_USER: z.string().default("default"),
  CLICKHOUSE_PASSWORD: z.string().default(""),

  /** Cache TTL for /trending endpoint in seconds */
  TRENDING_CACHE_TTL_SECONDS: z
    .string()
    .default("21600")
    .transform((val) => Number(val)),

  /**
   * UN Comtrade API subscription key.
   * Register at https://comtrade.un.org — free tier: 500 req/day.
   * Optional — requests without a key use the anonymous free tier.
   */
  COMTRADE_KEY: z
    .string()
    .optional()
    .describe("UN Comtrade API subscription key (Ocp-Apim-Subscription-Key)"),
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
