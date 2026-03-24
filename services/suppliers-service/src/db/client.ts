// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — suppliers-service PostgreSQL + Drizzle client
// ─────────────────────────────────────────────────────────────────────────────

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;

/** Ping the database to verify connectivity */
export async function pingDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}
