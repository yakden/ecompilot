// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — auth-service: Drizzle + pg client
// ─────────────────────────────────────────────────────────────────────────────

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function createDbPool(): Pool {
  return new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (_db === null) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return _db;
}

export function initDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (_db !== null) return _db;
  _pool = createDbPool();
  _db = drizzle(_pool, { schema });
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_pool !== null) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}

export type Db = ReturnType<typeof drizzle<typeof schema>>;
