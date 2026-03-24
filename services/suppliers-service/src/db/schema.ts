// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — suppliers-service Drizzle ORM schema
// ─────────────────────────────────────────────────────────────────────────────

import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  numeric,
  jsonb,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const supplierTypeEnum = pgEnum("supplier_type", [
  "china",
  "poland",
  "turkey",
  "eu",
  "dropship",
]);

export const conversionStatusEnum = pgEnum("conversion_status", [
  "pending",
  "confirmed",
  "paid",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Shared timestamp columns helper
// ─────────────────────────────────────────────────────────────────────────────

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

// ─────────────────────────────────────────────────────────────────────────────
// suppliers
// ─────────────────────────────────────────────────────────────────────────────

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),

  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  type: supplierTypeEnum("type").notNull(),

  country: text("country"),
  website: text("website"),
  logoUrl: text("logo_url"),

  /** Multilingual description: { ru, pl, ua, en } */
  description: jsonb("description").$type<{
    ru?: string;
    pl?: string;
    ua?: string;
    en?: string;
  }>(),

  minimumOrderEur: integer("minimum_order_eur"),

  /** Product categories, e.g. ["electronics", "clothing"] */
  categories: text("categories").array().notNull().default(sql`'{}'::text[]`),

  /** Supported sourcing platforms: '1688', 'alibaba', 'allegro', etc. */
  platforms: text("platforms").array().notNull().default(sql`'{}'::text[]`),

  supportsDropship: boolean("supports_dropship").notNull().default(false),

  /** Baselinker integration ID, if any */
  hasBaselinkerId: text("has_baselinker_id"),

  isVerified: boolean("is_verified").notNull().default(false),

  /** Average rating 0.00–5.00 */
  rating: numeric("rating", { precision: 3, scale: 2 }).notNull().default("0"),

  reviewCount: integer("review_count").notNull().default(0),

  /** Languages the supplier communicates in */
  languages: text("languages").array().notNull().default(sql`'{}'::text[]`),

  /** Contact channels */
  contacts: jsonb("contacts").$type<{
    telegram?: string;
    email?: string;
    whatsapp?: string;
    phone?: string;
  }>(),

  /** Shipping terms, methods, regions */
  shippingInfo: jsonb("shipping_info").$type<{
    methods?: string[];
    regionsServed?: string[];
    averageDaysToPoland?: number;
    freeShippingAboveEur?: number;
    notes?: string;
  }>(),

  /** Partner commission percentage, e.g. 10.00 = 10% */
  partnerCommissionPct: numeric("partner_commission_pct", {
    precision: 5,
    scale: 2,
  }),

  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),

  isActive: boolean("is_active").notNull().default(true),
  isFeatured: boolean("is_featured").notNull().default(false),

  ...timestamps,
});

// ─────────────────────────────────────────────────────────────────────────────
// supplier_reviews
// ─────────────────────────────────────────────────────────────────────────────

export const supplierReviews = pgTable("supplier_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),

  supplierId: uuid("supplier_id")
    .notNull()
    .references(() => suppliers.id, { onDelete: "cascade" }),

  /** UUID of the reviewing user (from auth-service) */
  userId: uuid("user_id").notNull(),

  /** 1–5 star rating */
  rating: integer("rating").notNull(),

  comment: text("comment"),
  language: text("language"),

  pros: text("pros").array().notNull().default(sql`'{}'::text[]`),
  cons: text("cons").array().notNull().default(sql`'{}'::text[]`),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// partner_clicks
// ─────────────────────────────────────────────────────────────────────────────

export const partnerClicks = pgTable("partner_clicks", {
  id: uuid("id").primaryKey().defaultRandom(),

  supplierId: uuid("supplier_id")
    .notNull()
    .references(() => suppliers.id),

  /** Nullable — anonymous clicks are allowed */
  userId: uuid("user_id"),

  utmSource: text("utm_source"),
  ipAddress: text("ip_address"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// partner_conversions
// ─────────────────────────────────────────────────────────────────────────────

export const partnerConversions = pgTable("partner_conversions", {
  id: uuid("id").primaryKey().defaultRandom(),

  clickId: uuid("click_id")
    .notNull()
    .references(() => partnerClicks.id),

  supplierId: uuid("supplier_id")
    .notNull()
    .references(() => suppliers.id),

  userId: uuid("user_id").notNull(),

  /** Order value in EUR cents */
  orderAmount: integer("order_amount").notNull(),

  /** Commission in EUR cents */
  commissionAmount: integer("commission_amount").notNull(),

  status: conversionStatusEnum("status").notNull().default("pending"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Inferred types
// ─────────────────────────────────────────────────────────────────────────────

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
export type SupplierReview = typeof supplierReviews.$inferSelect;
export type NewSupplierReview = typeof supplierReviews.$inferInsert;
export type PartnerClick = typeof partnerClicks.$inferSelect;
export type NewPartnerClick = typeof partnerClicks.$inferInsert;
export type PartnerConversion = typeof partnerConversions.$inferSelect;
export type NewPartnerConversion = typeof partnerConversions.$inferInsert;

export type SupplierType = (typeof supplierTypeEnum.enumValues)[number];
export type ConversionStatus = (typeof conversionStatusEnum.enumValues)[number];
