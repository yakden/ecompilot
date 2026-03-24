// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — scraper-service
// Environment configuration validated with Zod at startup
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

const EnvSchema = z.object({
  PORT: z
    .string()
    .default("3018")
    .transform((v) => {
      const port = parseInt(v, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid PORT value: ${v}`);
      }
      return port;
    })
    .describe("HTTP server port (default: 3018)"),

  REDIS_URL: z
    .string()
    .url()
    .default("redis://localhost:6379")
    .describe("Redis connection URL for scrape result caching"),

  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development")
    .describe("Runtime environment"),

  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info")
    .describe("Pino log level"),

  BROWSER_HEADLESS: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() !== "false")
    .describe("Run Playwright Chromium in headless mode (default: true)"),

  MAX_CONCURRENT_SCRAPES: z
    .string()
    .default("1")
    .transform((v) => {
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 1 || n > 10) {
        throw new Error(`Invalid MAX_CONCURRENT_SCRAPES value: ${v} (must be 1-10)`);
      }
      return n;
    })
    .describe("Maximum concurrent Playwright scrape operations (default: 1)"),

  SCRAPE_DELAY_MS: z
    .string()
    .default("3000")
    .transform((v) => {
      const ms = parseInt(v, 10);
      if (isNaN(ms) || ms < 0) {
        throw new Error(`Invalid SCRAPE_DELAY_MS value: ${v}`);
      }
      return ms;
    })
    .describe("Minimum delay between scrape requests in milliseconds (default: 3000)"),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(
      `scraper-service: Invalid environment configuration:\n${formatted}`,
    );
  }

  return result.data;
}

// Parsed once at module load — throws on misconfiguration before the server
// attempts to bind any ports.
export const env: Env = parseEnv();
