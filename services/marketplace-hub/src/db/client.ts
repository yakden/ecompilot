// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — marketplace-hub: Drizzle + pg pool singleton
// ─────────────────────────────────────────────────────────────────────────────

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

let _pool: pg.Pool | null = null;
let _db: Db | null = null;

export function getPool(): pg.Pool {
  if (_pool === null) {
    _pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return _pool;
}

export function getDb(): Db {
  if (_db === null) {
    _db = drizzle(getPool(), { schema });
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
