// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — ai-service / drizzle.config.ts
// Drizzle Kit migration configuration
// ─────────────────────────────────────────────────────────────────────────────

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "",
  },
  verbose: true,
  strict: true,
});
