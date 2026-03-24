// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — analytics-service
// Drizzle ORM + pg pool connection factory
// ─────────────────────────────────────────────────────────────────────────────

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createLogger } from "@ecompilot/shared-observability";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

const logger = createLogger({ service: "analytics-service" });

// ─────────────────────────────────────────────────────────────────────────────
// Connection pool singleton
// ─────────────────────────────────────────────────────────────────────────────

let _pool: Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;

export function getPool(): Pool {
  if (_pool === null) {
    _pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    _pool.on("error", (err) => {
      logger.error({ err }, "PostgreSQL pool error");
    });
  }
  return _pool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (_db === null) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────

export async function pingPostgres(): Promise<boolean> {
  try {
    const pool = getPool();
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────

export async function closePool(): Promise<void> {
  if (_pool !== null) {
    await _pool.end();
    _pool = null;
    _db = null;
    logger.info("PostgreSQL pool closed");
  }
}
