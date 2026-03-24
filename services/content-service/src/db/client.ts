// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — content-service
// Drizzle ORM + pg Pool client factory
// ─────────────────────────────────────────────────────────────────────────────

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";
import { env } from "../config/env.js";

export type Database = NodePgDatabase<typeof schema>;

let _db: Database | null = null;
let _pool: pg.Pool | null = null;

export function getDatabase(): Database {
  if (_db !== null) return _db;

  _pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  _db = drizzle(_pool, { schema });
  return _db;
}

export function getPool(): pg.Pool {
  if (_pool !== null) return _pool;
  // Ensure initialised
  getDatabase();
  // After getDatabase() _pool is guaranteed to be non-null
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return _pool!;
}

export async function closeDatabaseConnection(): Promise<void> {
  if (_pool !== null) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
