// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — inventory-service
// Drizzle ORM schema — PostgreSQL
// ─────────────────────────────────────────────────────────────────────────────

import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  timestamp,
  date,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const abcClassEnum = pgEnum("abc_class", ["A", "B", "C"]);

export const alertTypeEnum = pgEnum("alert_type", [
  "low_stock",
  "out_of_stock",
  "overstock",
  "dead_stock",
]);

// ─── products ────────────────────────────────────────────────────────────────

/**
 * Core product catalogue per user.
 * All monetary values are stored in grosze (1 PLN = 100 grosze) as integers
 * to avoid floating-point precision issues.
 */
export const products = pgTable(
  "inv_products",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** References auth-service users — no FK constraint (cross-service). */
    userId: uuid("user_id").notNull(),

    /** Unique stock-keeping unit per user. */
    sku: text("sku").notNull(),

    name: text("name").notNull(),

    category: text("category").notNull(),

    /** Purchase / cost price in grosze. */
    purchasePrice: integer("purchase_price").notNull(),

    /** Selling price on marketplace in grosze. */
    sellingPrice: integer("selling_price").notNull(),

    /** Units currently available in warehouse. */
    currentStock: integer("current_stock").notNull().default(0),

    /** Units reserved / pending dispatch. */
    reservedStock: integer("reserved_stock").notNull().default(0),

    /** Stock level that triggers a reorder alert. */
    reorderPoint: integer("reorder_point").notNull().default(10),

    /** Expected supplier lead time in days. */
    leadTimeDays: integer("lead_time_days").notNull().default(30),

    /** Timestamp of the most recent sale for this product. */
    lastSoldAt: timestamp("last_sold_at", { withTimezone: true, mode: "date" }),

    /** Cumulative units sold all-time. */
    totalSold: integer("total_sold").notNull().default(0),

    /** Cumulative revenue all-time in grosze. */
    totalRevenue: integer("total_revenue").notNull().default(0),

    /** Pareto ABC classification — null until analysis is run. */
    abcClass: abcClassEnum("abc_class"),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    invProductsUserIdx: index("inv_products_user_idx").on(t.userId),
    invProductsSkuUniqueIdx: uniqueIndex("inv_products_sku_unique_idx").on(
      t.userId,
      t.sku,
    ),
    invProductsCategoryIdx: index("inv_products_category_idx").on(t.category),
    invProductsAbcIdx: index("inv_products_abc_idx").on(t.abcClass),
    invProductsLastSoldIdx: index("inv_products_last_sold_idx").on(t.lastSoldAt),
  }),
);

// ─── inventory_snapshots ──────────────────────────────────────────────────────

/**
 * Daily snapshot of stock levels and sales performance per product.
 * Used for trend analysis and demand forecasting.
 */
export const inventorySnapshots = pgTable(
  "inv_snapshots",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** References inv_products.id */
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),

    /** Stock level at end of day. */
    stock: integer("stock").notNull(),

    /** The calendar date this snapshot represents. */
    date: date("date", { mode: "string" }).notNull(),

    /** Units sold on this day. */
    soldCount: integer("sold_count").notNull().default(0),

    /** Revenue from sales on this day in grosze. */
    revenue: integer("revenue").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    invSnapshotsProductIdx: index("inv_snapshots_product_idx").on(t.productId),
    invSnapshotsDateIdx: index("inv_snapshots_date_idx").on(t.date),
    invSnapshotsProductDateIdx: uniqueIndex("inv_snapshots_product_date_idx").on(
      t.productId,
      t.date,
    ),
  }),
);

// ─── reorder_alerts ───────────────────────────────────────────────────────────

/**
 * Triggered automatically when stock thresholds are breached.
 */
export const reorderAlerts = pgTable(
  "inv_reorder_alerts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** References inv_products.id */
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),

    alertType: alertTypeEnum("alert_type").notNull(),

    currentStock: integer("current_stock").notNull(),

    reorderPoint: integer("reorder_point").notNull(),

    /** True once the merchant has acknowledged / resolved the alert. */
    isAcknowledged: boolean("is_acknowledged").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    invAlertsProductIdx: index("inv_alerts_product_idx").on(t.productId),
    invAlertsTypeIdx: index("inv_alerts_type_idx").on(t.alertType),
    invAlertsAcknowledgedIdx: index("inv_alerts_acknowledged_idx").on(
      t.isAcknowledged,
    ),
  }),
);

// ─── Inferred types ───────────────────────────────────────────────────────────

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type InventorySnapshot = typeof inventorySnapshots.$inferSelect;
export type NewInventorySnapshot = typeof inventorySnapshots.$inferInsert;

export type ReorderAlert = typeof reorderAlerts.$inferSelect;
export type NewReorderAlert = typeof reorderAlerts.$inferInsert;

export type AbcClass = (typeof abcClassEnum.enumValues)[number];
export type AlertType = (typeof alertTypeEnum.enumValues)[number];
