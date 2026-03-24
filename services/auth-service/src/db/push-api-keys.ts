// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — auth-service: Create user_api_keys table
// Usage: DATABASE_URL=... npx tsx src/db/push-api-keys.ts
// ─────────────────────────────────────────────────────────────────────────────

import { Pool } from "pg";

const DATABASE_URL = process.env["DATABASE_URL"];

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function run(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_api_keys (
        id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service       TEXT        NOT NULL,
        encrypted_data TEXT       NOT NULL,
        metadata      JSONB,
        is_active     BOOLEAN     DEFAULT TRUE,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_api_keys_user_service_idx
        ON user_api_keys (user_id, service);
    `);

    process.stdout.write("user_api_keys table created (or already exists)\n");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err: unknown) => {
  process.stderr.write(`Migration failed: ${String(err)}\n`);
  process.exit(1);
});
