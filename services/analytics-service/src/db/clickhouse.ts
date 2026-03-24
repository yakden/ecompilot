// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — analytics-service
// ClickHouse client + niche_snapshots schema (ReplacingMergeTree)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { createLogger } from "@ecompilot/shared-observability";
import { env } from "../config/env.js";

const logger = createLogger({ service: "analytics-service" });

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface NicheSnapshotRow {
  /** Date of the snapshot — partition key */
  readonly snapshot_date: string;
  /** Search keyword */
  readonly keyword: string;
  /** Allegro category numeric ID (0 if unknown) */
  readonly category_id: number;
  /** Total listings count found */
  readonly listings_count: number;
  /** Average price in PLN */
  readonly avg_price: number;
  /** Minimum price in PLN */
  readonly min_price: number;
  /** Maximum price in PLN */
  readonly max_price: number;
  /** Median price in PLN */
  readonly median_price: number;
  /** Unique seller count */
  readonly unique_sellers: number;
  /** Combined share of top-3 sellers (0-100) */
  readonly top3_seller_share: number;
  /** Google Trends score 0-100 */
  readonly google_trend_score: number;
  /** Composite NicheScore 0-100 */
  readonly niche_score: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DDL — table definition as ClickHouse SQL
// ─────────────────────────────────────────────────────────────────────────────

const CREATE_NICHE_SNAPSHOTS_TABLE = [
  "CREATE TABLE IF NOT EXISTS niche_snapshots",
  "(",
  "    snapshot_date     Date,",
  "    keyword           LowCardinality(String),",
  "    category_id       UInt32,",
  "    listings_count    UInt32,",
  "    avg_price         Float64,",
  "    min_price         Float64,",
  "    max_price         Float64,",
  "    median_price      Float64,",
  "    unique_sellers    UInt32,",
  "    top3_seller_share Float32,",
  "    google_trend_score Float32,",
  "    niche_score       Float32",
  ")",
  "ENGINE = ReplacingMergeTree()",
  "PARTITION BY toYYYYMM(snapshot_date)",
  "ORDER BY (keyword, snapshot_date)",
  "TTL snapshot_date + INTERVAL 2 YEAR",
  "SETTINGS index_granularity = 8192",
].join("\n");

// ─────────────────────────────────────────────────────────────────────────────
// Client singleton
// ─────────────────────────────────────────────────────────────────────────────

let _client: ClickHouseClient | null = null;

export function getClickHouseClient(): ClickHouseClient {
  if (_client === null) {
    _client = createClient({
      url: env.CLICKHOUSE_URL,
      database: env.CLICKHOUSE_DB,
      // Credentials are read from env so they match whatever the docker-compose
      // CLICKHOUSE_USER / CLICKHOUSE_PASSWORD values are. Defaults fall back to
      // "default" / "" for a no-auth local instance.
      username: env.CLICKHOUSE_USER,
      password: env.CLICKHOUSE_PASSWORD,
      clickhouse_settings: {
        async_insert: 1,
        wait_for_async_insert: 0,
      },
    });
  }
  return _client;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema initialisation
// ─────────────────────────────────────────────────────────────────────────────

export async function initClickHouseSchema(): Promise<void> {
  const client = getClickHouseClient();

  await client.exec({
    query: CREATE_NICHE_SNAPSHOTS_TABLE,
    clickhouse_settings: { wait_end_of_query: 1 },
  });

  logger.info({ table: "niche_snapshots" }, "ClickHouse schema initialised");
}

// ─────────────────────────────────────────────────────────────────────────────
// Write helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert one or more niche snapshots into ClickHouse.
 * Uses async insert for throughput (fire-and-forget batch mode).
 */
export async function insertNicheSnapshots(
  rows: readonly NicheSnapshotRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const client = getClickHouseClient();

  await client.insert({
    table: "niche_snapshots",
    values: rows,
    format: "JSONEachRow",
  });

  logger.info({ count: rows.length }, "Inserted niche snapshots into ClickHouse");
}

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve historical snapshots for a given keyword.
 */
export async function queryNicheHistory(
  keyword: string,
  limit = 90,
): Promise<NicheSnapshotRow[]> {
  const client = getClickHouseClient();

  const result = await client.query({
    query: [
      "SELECT *",
      "FROM niche_snapshots",
      "WHERE keyword = {keyword: String}",
      "ORDER BY snapshot_date DESC",
      "LIMIT {limit: UInt32}",
    ].join("\n"),
    query_params: { keyword, limit },
    format: "JSONEachRow",
  });

  return result.json<NicheSnapshotRow>();
}

/**
 * Retrieve trending niches ordered by average niche_score
 * over the last N days.
 */
export async function queryTrendingNiches(
  topN = 20,
  lookbackDays = 7,
): Promise<Array<{ keyword: string; avg_score: number; latest_listings_count: number }>> {
  const client = getClickHouseClient();

  const result = await client.query({
    query: [
      "SELECT",
      "  keyword,",
      "  avg(niche_score)        AS avg_score,",
      "  max(listings_count)     AS latest_listings_count",
      "FROM niche_snapshots",
      "WHERE snapshot_date >= today() - {lookbackDays: UInt32}",
      "GROUP BY keyword",
      "ORDER BY avg_score DESC",
      "LIMIT {topN: UInt32}",
    ].join("\n"),
    query_params: { topN, lookbackDays },
    format: "JSONEachRow",
  });

  return result.json<{ keyword: string; avg_score: number; latest_listings_count: number }>();
}

/**
 * Retrieve competitor stats for a keyword from latest snapshot.
 */
export async function queryCompetitorStats(
  keyword: string,
): Promise<Array<{ unique_sellers: number; top3_seller_share: number; avg_price: number }>> {
  const client = getClickHouseClient();

  const result = await client.query({
    query: [
      "SELECT",
      "  argMax(unique_sellers, snapshot_date)    AS unique_sellers,",
      "  argMax(top3_seller_share, snapshot_date) AS top3_seller_share,",
      "  argMax(avg_price, snapshot_date)         AS avg_price",
      "FROM niche_snapshots",
      "WHERE keyword = {keyword: String}",
    ].join("\n"),
    query_params: { keyword },
    format: "JSONEachRow",
  });

  return result.json<{ unique_sellers: number; top3_seller_share: number; avg_price: number }>();
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────

export async function pingClickHouse(): Promise<boolean> {
  try {
    const client = getClickHouseClient();
    const result = await client.ping();
    return result.success;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────

export async function closeClickHouseClient(): Promise<void> {
  if (_client !== null) {
    await _client.close();
    _client = null;
    logger.info("ClickHouse client closed");
  }
}
