// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — logistics-engine
// Drizzle ORM schema — PostgreSQL
//
// PII notice:
//   Receiver address fields are stored AES-256-GCM encrypted.
//   Encryption/decryption is handled by the application layer
//   (src/services/pii.service.ts) using PII_ENCRYPTION_KEY.
//   The schema stores ciphertext strings; never raw PII.
// ─────────────────────────────────────────────────────────────────────────────

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  numeric,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const shipmentStatusEnum = pgEnum("shipment_status", [
  "created",
  "label_ready",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "ready_for_pickup",
  "delivered",
  "failed_delivery",
  "returned",
  "cancelled",
  "exception",
]);

export const carrierCodeEnum = pgEnum("carrier_code", [
  "inpost",
  "dpd",
  "dhl_domestic",
  "dhl_express",
  "orlen",
  "gls",
  "poczta_polska",
]);

export const labelFormatEnum = pgEnum("label_format", [
  "PDF",
  "ZPL_200DPI",
  "ZPL_300DPI",
  "EPL",
  "PNG",
]);

export const trackingEventStatusEnum = pgEnum("tracking_event_status", [
  "created",
  "label_ready",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "ready_for_pickup",
  "delivered",
  "failed_delivery",
  "returned",
  "cancelled",
  "exception",
]);

// ─────────────────────────────────────────────────────────────────────────────
// shipments
// ─────────────────────────────────────────────────────────────────────────────

export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // ── References ─────────────────────────────────────────────────────────
    orderId: uuid("order_id").notNull(),
    userId: uuid("user_id").notNull(),
    organizationId: uuid("organization_id"),

    // ── Carrier ────────────────────────────────────────────────────────────
    carrier: carrierCodeEnum("carrier").notNull(),
    /** Carrier-assigned shipment/parcel ID */
    carrierShipmentId: varchar("carrier_shipment_id", { length: 100 }),
    /** Normalised tracking number */
    trackingNumber: varchar("tracking_number", { length: 100 }),
    serviceType: varchar("service_type", { length: 50 }),

    // ── Status ─────────────────────────────────────────────────────────────
    status: shipmentStatusEnum("status").notNull().default("created"),

    // ── PII — receiver address (AES-256-GCM encrypted, stored as base64 JSON)
    // Format: { iv: base64, tag: base64, data: base64 }
    // Never decrypt in SQL — decryption is application-side only
    receiverEncrypted: text("receiver_encrypted").notNull(),

    // ── Label ──────────────────────────────────────────────────────────────
    /** AWS S3 URL to the label file */
    labelS3Url: text("label_s3_url"),
    labelFormat: labelFormatEnum("label_format"),
    returnLabelS3Url: text("return_label_s3_url"),

    // ── COD ────────────────────────────────────────────────────────────────
    isCod: boolean("is_cod").notNull().default(false),
    /** Decimal(10,2) in PLN */
    codAmount: numeric("cod_amount", { precision: 10, scale: 2 }),
    codBankAccount: varchar("cod_bank_account", { length: 34 }),

    // ── Dimensions ─────────────────────────────────────────────────────────
    weightKg: numeric("weight_kg", { precision: 7, scale: 3 }),
    lengthCm: numeric("length_cm", { precision: 7, scale: 1 }),
    widthCm: numeric("width_cm", { precision: 7, scale: 1 }),
    heightCm: numeric("height_cm", { precision: 7, scale: 1 }),
    parcelSize: varchar("parcel_size", { length: 10 }), // A/B/C for InPost

    // ── Pickup / Locker ────────────────────────────────────────────────────
    isLockerDelivery: boolean("is_locker_delivery").notNull().default(false),
    targetPickupPointId: varchar("target_pickup_point_id", { length: 100 }),

    // ── Insurance ──────────────────────────────────────────────────────────
    insuranceAmount: numeric("insurance_amount", { precision: 10, scale: 2 }),

    // ── Scheduling ─────────────────────────────────────────────────────────
    pickupConfirmationNumber: varchar("pickup_confirmation_number", { length: 100 }),
    estimatedDeliveryAt: timestamp("estimated_delivery_at", { withTimezone: true }),

    // ── Audit ──────────────────────────────────────────────────────────────
    reference: varchar("reference", { length: 255 }),
    /** Raw carrier API response for audit — JSONB */
    rawCarrierResponse: jsonb("raw_carrier_response"),

    // ── Timestamps ─────────────────────────────────────────────────────────
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Populated when delivered or returned */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Soft-delete */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    orderIdIdx: index("shipments_order_id_idx").on(t.orderId),
    userIdIdx: index("shipments_user_id_idx").on(t.userId),
    organizationIdIdx: index("shipments_organization_id_idx").on(t.organizationId),
    carrierIdx: index("shipments_carrier_idx").on(t.carrier),
    statusIdx: index("shipments_status_idx").on(t.status),
    createdAtIdx: index("shipments_created_at_idx").on(t.createdAt),
    trackingNumberUnique: uniqueIndex("shipments_tracking_number_unique").on(t.trackingNumber),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// tracking_events
// ─────────────────────────────────────────────────────────────────────────────

export const trackingEvents = pgTable(
  "tracking_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    trackingNumber: varchar("tracking_number", { length: 100 }).notNull(),
    carrier: carrierCodeEnum("carrier").notNull(),

    /** Normalised canonical status */
    status: trackingEventStatusEnum("status").notNull(),
    /** Raw carrier status string */
    rawStatus: varchar("raw_status", { length: 100 }).notNull(),
    /** ISO 8601 when this event occurred at the carrier */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    /** Human-readable location string */
    location: varchar("location", { length: 255 }),
    /** Event description (Polish) */
    description: text("description"),
    /** Additional carrier-specific attributes as JSON */
    attributes: jsonb("attributes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    shipmentIdIdx: index("tracking_events_shipment_id_idx").on(t.shipmentId),
    trackingNumberIdx: index("tracking_events_tracking_number_idx").on(t.trackingNumber),
    occurredAtIdx: index("tracking_events_occurred_at_idx").on(t.occurredAt),
    // Composite unique: prevent duplicate events for same tracking number + raw status + time
    uniqueEventIdx: uniqueIndex("tracking_events_unique_event_idx").on(
      t.trackingNumber,
      t.rawStatus,
      t.occurredAt,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// carrier_credentials
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stores per-organisation carrier API credentials.
 * Sensitive fields (apiToken, password) are AES-256-GCM encrypted at rest.
 *
 * passwordExpiresAt is relevant for Poczta Polska (Pocztex) which enforces
 * mandatory periodic password rotation (typically every 90 days).
 * The logistics engine schedules a notification job 7 days before expiry.
 */
export const carrierCredentials = pgTable(
  "carrier_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    carrier: carrierCodeEnum("carrier").notNull(),

    // ── Auth fields (all encrypted at rest) ────────────────────────────────
    /** API token / key — encrypted */
    apiTokenEncrypted: text("api_token_encrypted"),
    /** API secret / password — encrypted */
    apiSecretEncrypted: text("api_secret_encrypted"),
    /** Username / login — encrypted */
    usernameEncrypted: text("username_encrypted"),
    /** Additional account identifier (DPD masterFid, DHL24 accountId, etc.) */
    accountIdEncrypted: text("account_id_encrypted"),
    /** Organization ID specific to carrier (InPost orgId) */
    carrierOrganizationId: varchar("carrier_organization_id", { length: 100 }),

    // ── Metadata ───────────────────────────────────────────────────────────
    isActive: boolean("is_active").notNull().default(true),
    environment: varchar("environment", { length: 10 })
      .notNull()
      .default("production"), // "sandbox" | "production"

    // ── Password expiry (Poczta Polska) ────────────────────────────────────
    /** NULL for carriers without mandatory password rotation */
    passwordExpiresAt: timestamp("password_expires_at", { withTimezone: true }),
    /** Last successful API call — used to verify credentials are still valid */
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),

    // ── Timestamps ─────────────────────────────────────────────────────────
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

    // ── Audit ──────────────────────────────────────────────────────────────
    /** Who created/updated this record */
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
  },
  (t) => ({
    organizationIdIdx: index("carrier_creds_organization_id_idx").on(t.organizationId),
    carrierIdx: index("carrier_creds_carrier_idx").on(t.carrier),
    passwordExpiresAtIdx: index("carrier_creds_password_expires_at_idx").on(t.passwordExpiresAt),
    orgCarrierEnvUnique: uniqueIndex("carrier_creds_org_carrier_env_unique").on(
      t.organizationId,
      t.carrier,
      t.environment,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

export const shipmentsRelations = relations(shipments, ({ many }) => ({
  trackingEvents: many(trackingEvents),
}));

export const trackingEventsRelations = relations(trackingEvents, ({ one }) => ({
  shipment: one(shipments, {
    fields: [trackingEvents.shipmentId],
    references: [shipments.id],
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Inferred TypeScript types
// ─────────────────────────────────────────────────────────────────────────────

export type Shipment = typeof shipments.$inferSelect;
export type NewShipment = typeof shipments.$inferInsert;
export type TrackingEventRow = typeof trackingEvents.$inferSelect;
export type NewTrackingEvent = typeof trackingEvents.$inferInsert;
export type CarrierCredential = typeof carrierCredentials.$inferSelect;
export type NewCarrierCredential = typeof carrierCredentials.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Enum value types (useful for type-safe code)
// ─────────────────────────────────────────────────────────────────────────────

export type ShipmentStatusValue = (typeof shipmentStatusEnum.enumValues)[number];
export type CarrierCodeValue = (typeof carrierCodeEnum.enumValues)[number];
export type LabelFormatValue = (typeof labelFormatEnum.enumValues)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Table registry — used by integration tests and migrations
// ─────────────────────────────────────────────────────────────────────────────

export const SCHEMA_TABLES = {
  shipments,
  trackingEvents,
  carrierCredentials,
} as const;
