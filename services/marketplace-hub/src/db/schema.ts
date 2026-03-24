// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — marketplace-hub: Drizzle ORM PostgreSQL schema
//
// Security notes:
//  • accessToken, refreshToken stored encrypted via AES-256-GCM
//  • buyer PII (name, email, phone, street) stored encrypted
//  • idempotency_keys for at-least-once event processing
// ─────────────────────────────────────────────────────────────────────────────

import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { ConnectorCapabilities } from "../types/marketplace.js";

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const marketplacePlatformEnum = pgEnum("marketplace_platform", [
  "allegro",
  "amazon",
  "ebay",
  "etsy",
  "olx",
  "vinted",
  "empik",
  "erli",
]);

export const listingStatusEnum = pgEnum("listing_status", [
  "draft",
  "pending",
  "active",
  "inactive",
  "rejected",
  "ended",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
  "refunded",
]);

export const reservationStatusEnum = pgEnum("reservation_status", [
  "active",
  "fulfilled",
  "expired",
  "cancelled",
]);

// ─────────────────────────────────────────────────────────────────────────────
// seller_accounts
// Stores OAuth credentials (access/refresh tokens) encrypted at rest.
// One row per (userId x platform) combination.
// ─────────────────────────────────────────────────────────────────────────────

export const sellerAccounts = pgTable(
  "seller_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Foreign key into auth-service users table (cross-service reference) */
    userId: uuid("user_id").notNull(),
    platform: marketplacePlatformEnum("platform").notNull(),
    /** Seller's identifier on the platform (e.g. Allegro user ID) */
    platformUserId: text("platform_user_id").notNull(),
    /** Display name for the connected account */
    accountName: text("account_name"),
    /** AES-256-GCM encrypted access token */
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    /** AES-256-GCM encrypted refresh token */
    encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
    /** Platform-reported scopes granted */
    scopes: text("scopes").array(),
    /** Whether the account is currently enabled for sync */
    active: boolean("active").notNull().default(true),
    /** Last token refresh timestamp */
    lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
    /** Connector capabilities JSON (cached) */
    capabilities: jsonb("capabilities").$type<ConnectorCapabilities>(),
    /** Last error message (null if healthy) */
    lastErrorMessage: text("last_error_message"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("seller_accounts_user_id_idx").on(table.userId),
    platformIdx: index("seller_accounts_platform_idx").on(table.platform),
    userPlatformUq: uniqueIndex("seller_accounts_user_platform_uq").on(
      table.userId,
      table.platform,
    ),
  }),
);

export type SellerAccount = typeof sellerAccounts.$inferSelect;
export type NewSellerAccount = typeof sellerAccounts.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// product_listings
// Maps a canonical product (by SKU) to its platform-specific listing.
// One row per (sku x platform x accountId).
// ─────────────────────────────────────────────────────────────────────────────

export const productListings = pgTable(
  "product_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => sellerAccounts.id, { onDelete: "cascade" }),
    platform: marketplacePlatformEnum("platform").notNull(),
    sku: text("sku").notNull(),
    ean: text("ean"),
    /** Platform-assigned offer/listing ID */
    externalOfferId: text("external_offer_id"),
    status: listingStatusEnum("status").notNull().default("draft"),
    /** Canonical product snapshot at time of last sync (JSONB) */
    lastSyncedProduct: jsonb("last_synced_product").$type<Record<string, unknown>>(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    /** Platform URL to the published listing */
    listingUrl: text("listing_url"),
    /** Published price in grosz (PLN * 100) */
    publishedPriceGrosze: integer("published_price_grosze"),
    /** Published stock quantity */
    publishedStock: integer("published_stock"),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    accountIdIdx: index("product_listings_account_id_idx").on(table.accountId),
    skuIdx: index("product_listings_sku_idx").on(table.sku),
    platformIdx: index("product_listings_platform_idx").on(table.platform),
    externalOfferIdx: index("product_listings_external_offer_id_idx").on(
      table.externalOfferId,
    ),
    skuPlatformAccountUq: uniqueIndex(
      "product_listings_sku_platform_account_uq",
    ).on(table.sku, table.platform, table.accountId),
  }),
);

export type ProductListing = typeof productListings.$inferSelect;
export type NewProductListing = typeof productListings.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// orders
// Canonical order record. PII stored encrypted.
// ─────────────────────────────────────────────────────────────────────────────

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => sellerAccounts.id, { onDelete: "restrict" }),
    platform: marketplacePlatformEnum("platform").notNull(),
    marketplaceOrderId: text("marketplace_order_id").notNull(),
    status: orderStatusEnum("status").notNull().default("pending"),

    // ── Encrypted buyer PII ────────────────────────────────────────────────
    encryptedBuyerName: text("encrypted_buyer_name").notNull(),
    encryptedBuyerEmail: text("encrypted_buyer_email").notNull(),
    encryptedBuyerPhone: text("encrypted_buyer_phone"),

    // ── Shipping (non-PII summary) ─────────────────────────────────────────
    shippingCity: text("shipping_city"),
    shippingPostalCode: text("shipping_postal_code"),
    shippingCountryCode: text("shipping_country_code").notNull().default("PL"),
    /** Encrypted full street address */
    encryptedShippingStreet: text("encrypted_shipping_street"),
    shippingCarrier: text("shipping_carrier"),
    trackingNumber: text("tracking_number"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    estimatedDeliveryAt: timestamp("estimated_delivery_at", { withTimezone: true }),

    // ── Payment ────────────────────────────────────────────────────────────
    paymentMethod: text("payment_method"),
    paymentStatus: text("payment_status").notNull().default("pending"),
    /** Total order value in grosz (PLN * 100) */
    totalPriceGrosze: integer("total_price_grosze").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    externalPaymentId: text("external_payment_id"),

    // ── Line items (JSON array — denormalized for read performance) ────────
    items: jsonb("items").$type<
      ReadonlyArray<{
        sku: string;
        externalOfferId: string;
        name: string;
        quantity: number;
        unitPriceGrosze: number;
        totalPriceGrosze: number;
      }>
    >().notNull(),

    // ── Timestamps ─────────────────────────────────────────────────────────
    marketplaceCreatedAt: timestamp("marketplace_created_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    accountIdIdx: index("orders_account_id_idx").on(table.accountId),
    platformIdx: index("orders_platform_idx").on(table.platform),
    statusIdx: index("orders_status_idx").on(table.status),
    marketplaceCreatedAtIdx: index("orders_marketplace_created_at_idx").on(
      table.marketplaceCreatedAt,
    ),
    platformOrderUq: uniqueIndex("orders_platform_order_uq").on(
      table.platform,
      table.marketplaceOrderId,
      table.accountId,
    ),
  }),
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// stock_reservations
// Pessimistic locking: reserve stock before multi-platform sync.
// TTL-based expiry: 15-30 minutes.
// ─────────────────────────────────────────────────────────────────────────────

export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sku: text("sku").notNull(),
    /** Quantity reserved (deducted from available) */
    reservedQuantity: integer("reserved_quantity").notNull(),
    status: reservationStatusEnum("status").notNull().default("active"),
    /**
     * Which order or sync operation holds this reservation.
     * NULL = stock-sync buffer reservation.
     */
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    /** Platform this reservation is for (NULL = cross-platform buffer) */
    platform: marketplacePlatformEnum("platform"),
    /** Reservation expires at — worker sweeps expired rows */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    skuIdx: index("stock_reservations_sku_idx").on(table.sku),
    statusIdx: index("stock_reservations_status_idx").on(table.status),
    expiresAtIdx: index("stock_reservations_expires_at_idx").on(table.expiresAt),
    orderIdIdx: index("stock_reservations_order_id_idx").on(table.orderId),
  }),
);

export type StockReservation = typeof stockReservations.$inferSelect;
export type NewStockReservation = typeof stockReservations.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// idempotency_keys
// Ensures at-most-once processing for inbound webhooks and polling events.
// ─────────────────────────────────────────────────────────────────────────────

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The idempotency key (e.g. event ID from marketplace) */
    key: text("key").notNull(),
    /** Source system that generated the key */
    source: text("source").notNull(),
    /** HTTP status code or result code of the first processing attempt */
    resultCode: integer("result_code"),
    /** Response body (if any) cached for replay */
    resultBody: jsonb("result_body").$type<Record<string, unknown>>(),
    /** When this key was first processed */
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
    /** Key expires after 24h — cleaned up by maintenance job */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    keySourceUq: uniqueIndex("idempotency_keys_key_source_uq").on(
      table.key,
      table.source,
    ),
    expiresAtIdx: index("idempotency_keys_expires_at_idx").on(table.expiresAt),
  }),
);

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

export const sellerAccountsRelations = relations(sellerAccounts, ({ many }) => ({
  listings: many(productListings),
  orders: many(orders),
}));

export const productListingsRelations = relations(productListings, ({ one }) => ({
  account: one(sellerAccounts, {
    fields: [productListings.accountId],
    references: [sellerAccounts.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  account: one(sellerAccounts, {
    fields: [orders.accountId],
    references: [sellerAccounts.id],
  }),
  reservations: many(stockReservations),
}));

export const stockReservationsRelations = relations(stockReservations, ({ one }) => ({
  order: one(orders, {
    fields: [stockReservations.orderId],
    references: [orders.id],
  }),
}));
