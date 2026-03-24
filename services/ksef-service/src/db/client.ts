// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — ksef-service: Drizzle ORM database client
// PostgreSQL connection pool with Drizzle ORM
// ─────────────────────────────────────────────────────────────────────────────

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Singleton pattern — one pool per process
// ─────────────────────────────────────────────────────────────────────────────

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function initDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (_db !== null) return _db;

  _pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  _db = drizzle(_pool, { schema });
  return _db;
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (_db === null) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_pool !== null) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
