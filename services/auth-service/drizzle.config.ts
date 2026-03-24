// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — auth-service: Drizzle Kit configuration
// ─────────────────────────────────────────────────────────────────────────────

import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/auth",
  },
  verbose: true,
  strict: true,
} satisfies Config;
