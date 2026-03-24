// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — analytics-service
// Drizzle ORM PostgreSQL schema
// ─────────────────────────────────────────────────────────────────────────────

import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  jsonb,
  timestamp,
  pgEnum,
  date,
  index,
} from "drizzle-orm/pg-core";
import type { NicheAnalysisResult } from "../services/scoring.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const analysisStatusEnum = pgEnum("analysis_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export type AnalysisStatus = (typeof analysisStatusEnum.enumValues)[number];

// ─────────────────────────────────────────────────────────────────────────────
// niche_analyses
// Stores one record per niche analysis job
// ─────────────────────────────────────────────────────────────────────────────

export const nicheAnalyses = pgTable(
  "niche_analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Auth service userId (UUID string) */
    userId: text("user_id").notNull(),

    /** Search keyword analysed */
    keyword: text("keyword").notNull(),

    /** Composite NicheScore 0-100, null until completed */
    score: numeric("score", { precision: 5, scale: 2 }),

    /** Full NicheAnalysisResult JSON, null until completed */
    result: jsonb("result").$type<NicheAnalysisResult>(),

    /** Current pipeline status */
    status: analysisStatusEnum("status").notNull().default("pending"),

    /** BullMQ job ID for status polling */
    jobId: text("job_id").notNull(),

    /** Error message if status = failed */
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("niche_analyses_user_id_idx").on(table.userId),
    keywordIdx: index("niche_analyses_keyword_idx").on(table.keyword),
    jobIdIdx: index("niche_analyses_job_id_idx").on(table.jobId),
    statusIdx: index("niche_analyses_status_idx").on(table.status),
    createdAtIdx: index("niche_analyses_created_at_idx").on(table.createdAt),
  }),
);

export type NicheAnalysisRow = typeof nicheAnalyses.$inferSelect;
export type NewNicheAnalysisRow = typeof nicheAnalyses.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// competitor_snapshots
// Point-in-time snapshot of a seller's metrics for a given keyword
// ─────────────────────────────────────────────────────────────────────────────

export const competitorSnapshots = pgTable(
  "competitor_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** The keyword context for this snapshot */
    keyword: text("keyword").notNull(),

    /** Allegro seller ID (string identifier from the platform) */
    sellerId: text("seller_id").notNull(),

    /** Display name of the seller */
    sellerName: text("seller_name").notNull(),

    /** Seller rating 0-5 (or 0-100 depending on Allegro's scale) */
    rating: numeric("rating", { precision: 5, scale: 2 }).notNull().default("0"),

    /** Total active listings count for this keyword snapshot */
    listingsCount: integer("listings_count").notNull().default(0),

    /** Average price across all listed items (PLN) */
    avgPrice: numeric("avg_price", { precision: 10, scale: 2 }).notNull().default("0"),

    /** Date of this snapshot (date only, no time) */
    snapshotDate: date("snapshot_date").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keywordIdx: index("competitor_snapshots_keyword_idx").on(table.keyword),
    sellerIdIdx: index("competitor_snapshots_seller_id_idx").on(table.sellerId),
    snapshotDateIdx: index("competitor_snapshots_snapshot_date_idx").on(table.snapshotDate),
    keywordSellerIdx: index("competitor_snapshots_keyword_seller_idx").on(table.keyword, table.sellerId),
  }),
);

export type CompetitorSnapshotRow = typeof competitorSnapshots.$inferSelect;
export type NewCompetitorSnapshotRow = typeof competitorSnapshots.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// usage_counters
// Tracks per-user monthly usage for plan enforcement
// ─────────────────────────────────────────────────────────────────────────────

export const usageCounters = pgTable(
  "usage_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Auth service userId */
    userId: text("user_id").notNull(),

    /** Feature identifier */
    feature: text("feature").notNull(),

    /** YYYY-MM billing period key */
    period: text("period").notNull(),

    /** Current usage count */
    count: integer("count").notNull().default(0),

    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userPeriodFeatureIdx: index("usage_counters_user_period_feature_idx").on(
      table.userId,
      table.period,
      table.feature,
    ),
  }),
);

export type UsageCounterRow = typeof usageCounters.$inferSelect;
export type NewUsageCounterRow = typeof usageCounters.$inferInsert;
