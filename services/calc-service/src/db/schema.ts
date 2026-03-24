// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — calc-service
// Drizzle ORM schema — PostgreSQL
// ─────────────────────────────────────────────────────────────────────────────

import {
  pgTable,
  text,
  uuid,
  jsonb,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const calculationTypeEnum = pgEnum("calculation_type", [
  "margin",
  "zus",
  "allegro-fees",
  "delivery",
  "breakeven",
  "roi",
]);

// ─── calculation_history ─────────────────────────────────────────────────────

/**
 * Stores every calculation performed by a user.
 * userId references auth-service users — no FK constraint here (cross-service).
 * input and result are JSONB to accommodate the evolving shape of each calc type.
 */
export const calculationHistory = pgTable(
  "calculation_history",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    userId: uuid("user_id").notNull(),

    type: calculationTypeEnum("type").notNull(),

    /** Raw request payload as received by the route handler */
    input: jsonb("input").notNull(),

    /** Serialised calculator result */
    result: jsonb("result").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    calcHistoryUserIdx: index("calc_history_user_idx").on(t.userId),
    calcHistoryTypeIdx: index("calc_history_type_idx").on(t.type),
    calcHistoryCreatedIdx: index("calc_history_created_idx").on(t.createdAt),
  }),
);

// ─── rate_config ──────────────────────────────────────────────────────────────

/**
 * Key/value store for rates that change over time:
 * ZUS contribution amounts, VAT rates, NBP exchange rates, Allegro tariffs, etc.
 *
 * key examples:
 *   "zus.2025.full.emerytalne"  → { value: 812.23 }
 *   "allegro.commission.Electronics" → { pct: 8.5 }
 *   "nbp.usd_pln"              → { rate: 4.02, date: "2025-03-21" }
 */
export const rateConfig = pgTable(
  "rate_config",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Dot-namespaced key, e.g. "zus.2025.full.emerytalne" */
    key: text("key").notNull(),

    /** Arbitrary JSON payload for the rate */
    value: jsonb("value").notNull(),

    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    rateConfigKeyUniqueIdx: uniqueIndex("rate_config_key_unique_idx").on(t.key),
    rateConfigUpdatedIdx: index("rate_config_updated_idx").on(t.updatedAt),
  }),
);

// ─── Inferred types ──────────────────────────────────────────────────────────

export type CalculationHistory = typeof calculationHistory.$inferSelect;
export type NewCalculationHistory = typeof calculationHistory.$inferInsert;

export type RateConfig = typeof rateConfig.$inferSelect;
export type NewRateConfig = typeof rateConfig.$inferInsert;

export type CalculationType = (typeof calculationTypeEnum.enumValues)[number];
