// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — billing-service: Drizzle ORM PostgreSQL schema
// PCI DSS: card data is NEVER stored — only Stripe IDs and metadata
// ─────────────────────────────────────────────────────────────────────────────

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Enums as const — typed text columns with runtime safety
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_VALUES = ["free", "pro", "business"] as const;
export const INTERVAL_VALUES = ["monthly", "yearly"] as const;
export const SUBSCRIPTION_STATUS_VALUES = [
  "active",
  "canceled",
  "past_due",
  "trialing",
] as const;
export const INVOICE_STATUS_VALUES = [
  "draft",
  "open",
  "paid",
  "void",
  "uncollectible",
] as const;

export type Plan = (typeof PLAN_VALUES)[number];
export type BillingInterval = (typeof INTERVAL_VALUES)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS_VALUES)[number];
export type InvoiceStatus = (typeof INVOICE_STATUS_VALUES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// subscriptions
// Tracks the current subscription state per user (1:1 via userId unique)
// ─────────────────────────────────────────────────────────────────────────────

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Internal user ID — one subscription record per user */
    userId: uuid("user_id").notNull().unique(),

    /** Stripe customer ID — created on first checkout */
    stripeCustomerId: text("stripe_customer_id").notNull().unique(),

    /** Stripe subscription ID — null for free plan */
    stripeSubscriptionId: text("stripe_subscription_id").unique(),

    /** Current plan tier */
    plan: text("plan").$type<Plan>().notNull().default("free"),

    /** Billing cadence — null for free plan */
    interval: text("interval").$type<BillingInterval>(),

    /** Stripe-reported subscription status */
    status: text("status")
      .$type<SubscriptionStatus>()
      .notNull()
      .default("active"),

    /** Unix timestamp → Date: start of current billing period */
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }),

    /** Unix timestamp → Date: end of current billing period */
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),

    /** True when scheduled to cancel at period end */
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),

    /** Trial end date — null when no trial */
    trialEnd: timestamp("trial_end", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("subscriptions_user_id_idx").on(table.userId),
    stripeCustomerIdIdx: uniqueIndex("subscriptions_stripe_customer_id_idx").on(
      table.stripeCustomerId,
    ),
    stripeSubscriptionIdIdx: uniqueIndex(
      "subscriptions_stripe_subscription_id_idx",
    ).on(table.stripeSubscriptionId),
    planIdx: index("subscriptions_plan_idx").on(table.plan),
    statusIdx: index("subscriptions_status_idx").on(table.status),
  }),
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// webhook_events
// Idempotency log — Stripe event ID is the primary key (text, not UUID)
// ─────────────────────────────────────────────────────────────────────────────

export const webhookEvents = pgTable(
  "webhook_events",
  {
    /** Stripe event ID (e.g. evt_1ABC...) — natural PK for idempotency */
    id: text("id").primaryKey(),

    /** Stripe event type (e.g. customer.subscription.updated) */
    type: text("type").notNull(),

    /** Full raw Stripe event payload stored for audit and manual retry */
    payload: jsonb("payload").notNull(),

    /** False = received but not yet processed; True = handler ran successfully */
    processed: boolean("processed").notNull().default(false),

    /** Timestamp when handler completed — null if not yet processed */
    processedAt: timestamp("processed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    typeIdx: index("webhook_events_type_idx").on(table.type),
    processedIdx: index("webhook_events_processed_idx").on(table.processed),
    createdAtIdx: index("webhook_events_created_at_idx").on(table.createdAt),
  }),
);

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// invoices
// Mirrors Stripe invoice metadata for in-app invoice history
// PCI DSS: stores only invoice metadata — no card numbers, no CVVs
// ─────────────────────────────────────────────────────────────────────────────

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Internal user ID */
    userId: uuid("user_id").notNull(),

    /** Stripe invoice ID (e.g. in_1ABC...) */
    stripeInvoiceId: text("stripe_invoice_id").notNull().unique(),

    /** Amount in smallest currency unit (cents for EUR) — e.g. 2900 = €29.00 */
    amount: integer("amount").notNull(),

    /** ISO 4217 currency code */
    currency: text("currency").notNull().default("eur"),

    /** Stripe-reported invoice status */
    status: text("status").$type<InvoiceStatus>().notNull(),

    /** Stripe-hosted invoice PDF URL */
    pdfUrl: text("pdf_url"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("invoices_user_id_idx").on(table.userId),
    stripeInvoiceIdIdx: uniqueIndex("invoices_stripe_invoice_id_idx").on(
      table.stripeInvoiceId,
    ),
    statusIdx: index("invoices_status_idx").on(table.status),
    createdAtIdx: index("invoices_created_at_idx").on(table.createdAt),
  }),
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

export const subscriptionsRelations = relations(subscriptions, () => ({}));

export const webhookEventsRelations = relations(webhookEvents, () => ({}));

export const invoicesRelations = relations(invoices, () => ({}));
