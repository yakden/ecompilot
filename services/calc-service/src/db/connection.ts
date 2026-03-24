// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — calc-service
// PostgreSQL connection via Drizzle ORM + pg Pool
// ─────────────────────────────────────────────────────────────────────────────

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getPool(): Pool {
  if (_pool === null) {
    _pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return _pool;
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
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
