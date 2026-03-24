// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — suppliers-service env config
// Validated at startup — process exits if any required var is missing
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .describe("PostgreSQL connection string (postgres://user:pass@host:port/db)"),
  REDIS_URL: z
    .string()
    .min(1)
    .describe("Redis connection string (redis://host:port)"),
  ELASTICSEARCH_URL: z
    .string()
    .url()
    .default("http://localhost:9200")
    .describe("Elasticsearch HTTP endpoint"),
  NATS_URL: z
    .string()
    .min(1)
    .describe("NATS server URL (nats://host:4222)"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3005),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  /** JWT secret shared with auth-service — used for HS256 service-to-service verification */
  JWT_SECRET: z.string().min(32).describe("HS256 JWT signing secret"),
  /**
   * RSA public key from auth-service — used to verify RS256 user tokens.
   * Optional: when set, allows user-facing JWT tokens issued by auth-service
   * to be accepted directly (without requiring HS256 re-signing by a proxy).
   */
  JWT_PUBLIC_KEY: z.string().optional().describe("RSA public key for RS256 JWT verification"),
  /** Partner cookie TTL in seconds (default 30 days) */
  PARTNER_COOKIE_TTL_SEC: z.coerce.number().int().positive().default(2_592_000),
  /** Elasticsearch index name for suppliers */
  ES_INDEX_SUPPLIERS: z.string().min(1).default("suppliers"),
  /**
   * CEIDG API Bearer token — obtained for free at https://dane.biznes.gov.pl
   * Required for GET /api/v1/suppliers/verify-nip/:nip
   * Leave unset in development to use stub responses.
   */
  CEIDG_TOKEN: z.string().min(1).optional().describe("CEIDG API Bearer token"),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    // Use process.stderr directly — logger not yet initialized at this point
    process.stderr.write(
      `[suppliers-service] Invalid environment configuration:\n${formatted}\n`,
    );
    process.exit(1);
  }
  return result.data;
}

export const env = parseEnv();
