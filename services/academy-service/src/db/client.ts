// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — academy-service / db/client.ts
// Drizzle + pg pool singleton
// ─────────────────────────────────────────────────────────────────────────────

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Pool configuration
// ─────────────────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// ─────────────────────────────────────────────────────────────────────────────
// Drizzle instance
// ─────────────────────────────────────────────────────────────────────────────

export const db = drizzle(pool, { schema });

// ─────────────────────────────────────────────────────────────────────────────
// Health check helper
// ─────────────────────────────────────────────────────────────────────────────

export async function checkDbConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Graceful disconnect
// ─────────────────────────────────────────────────────────────────────────────

export async function closeDb(): Promise<void> {
  await pool.end();
}

export { pool };
