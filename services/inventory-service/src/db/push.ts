// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — inventory-service
// Database table creation script (CREATE TABLE IF NOT EXISTS)
// Run: DATABASE_URL=... tsx src/db/push.ts
// ─────────────────────────────────────────────────────────────────────────────

import { Pool } from "pg";

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://ecompilot:ecompilot_secret@localhost:5432/ecompilot";

const DDL = `
-- ─── Enums ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE abc_class AS ENUM ('A', 'B', 'C');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE alert_type AS ENUM (
    'low_stock', 'out_of_stock', 'overstock', 'dead_stock'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── inv_products ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inv_products (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL,
  sku              TEXT        NOT NULL,
  name             TEXT        NOT NULL,
  category         TEXT        NOT NULL,
  purchase_price   INTEGER     NOT NULL,
  selling_price    INTEGER     NOT NULL,
  current_stock    INTEGER     NOT NULL DEFAULT 0,
  reserved_stock   INTEGER     NOT NULL DEFAULT 0,
  reorder_point    INTEGER     NOT NULL DEFAULT 10,
  lead_time_days   INTEGER     NOT NULL DEFAULT 30,
  last_sold_at     TIMESTAMPTZ,
  total_sold       INTEGER     NOT NULL DEFAULT 0,
  total_revenue    INTEGER     NOT NULL DEFAULT 0,
  abc_class        abc_class,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS inv_products_sku_unique_idx
  ON inv_products (user_id, sku);
CREATE INDEX IF NOT EXISTS inv_products_user_idx
  ON inv_products (user_id);
CREATE INDEX IF NOT EXISTS inv_products_category_idx
  ON inv_products (category);
CREATE INDEX IF NOT EXISTS inv_products_abc_idx
  ON inv_products (abc_class);
CREATE INDEX IF NOT EXISTS inv_products_last_sold_idx
  ON inv_products (last_sold_at);

-- ─── inv_snapshots ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inv_snapshots (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID        NOT NULL REFERENCES inv_products(id) ON DELETE CASCADE,
  stock       INTEGER     NOT NULL,
  date        DATE        NOT NULL,
  sold_count  INTEGER     NOT NULL DEFAULT 0,
  revenue     INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS inv_snapshots_product_date_idx
  ON inv_snapshots (product_id, date);
CREATE INDEX IF NOT EXISTS inv_snapshots_product_idx
  ON inv_snapshots (product_id);
CREATE INDEX IF NOT EXISTS inv_snapshots_date_idx
  ON inv_snapshots (date);

-- ─── inv_reorder_alerts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inv_reorder_alerts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID        NOT NULL REFERENCES inv_products(id) ON DELETE CASCADE,
  alert_type       alert_type  NOT NULL,
  current_stock    INTEGER     NOT NULL,
  reorder_point    INTEGER     NOT NULL,
  is_acknowledged  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inv_alerts_product_idx
  ON inv_reorder_alerts (product_id);
CREATE INDEX IF NOT EXISTS inv_alerts_type_idx
  ON inv_reorder_alerts (alert_type);
CREATE INDEX IF NOT EXISTS inv_alerts_acknowledged_idx
  ON inv_reorder_alerts (is_acknowledged);
`;

async function pushSchema(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(DDL);
    await client.query("COMMIT");
    process.stdout.write("Schema pushed successfully.\n");
  } catch (err) {
    await client.query("ROLLBACK");
    process.stderr.write(`Schema push failed: ${String(err)}\n`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

pushSchema().catch((err: unknown) => {
  process.stderr.write(`Unexpected error: ${String(err)}\n`);
  process.exit(1);
});
