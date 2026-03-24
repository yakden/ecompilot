// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — payment-reconciliation
// Drizzle ORM schema
//
// Conventions:
//   - All monetary amounts stored in grosze (integer, no rounding errors)
//   - commissionRate stored as numeric(6,4) e.g. 0.0129
//   - Timestamps as timestamptz
//   - UUID primary keys (gen_random_uuid())
//   - Soft deletes via deletedAt on gateway_credentials
// ─────────────────────────────────────────────────────────────────────────────

import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  numeric,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const gatewayCodeEnum = pgEnum("gateway_code", [
  "przelewy24",
  "payu",
  "tpay",
  "paynow",
  "imoje",
]);

export const currencyEnum = pgEnum("currency", [
  "PLN",
  "EUR",
  "GBP",
  "USD",
  "CZK",
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending",
  "waiting_for_payment",
  "processing",
  "completed",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
  "disputed",
  "chargeback",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "blik",
  "blik_recurring",
  "card",
  "bank_transfer",
  "pbl",
  "installments",
  "bnpl",
  "b2b_bnpl",
  "apple_pay",
  "google_pay",
]);

export const refundStatusEnum = pgEnum("refund_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export const reconciliationStatusEnum = pgEnum("reconciliation_status", [
  "pending",
  "completed",
  "failed",
]);

export const discrepancyTypeEnum = pgEnum("discrepancy_type", [
  "order_without_payment",
  "payment_without_order",
  "amount_mismatch",
  "missing_b2b_invoice",
  "refund_without_credit_note",
  "duplicate_payment",
  "currency_mismatch",
  "status_mismatch",
]);

// ─────────────────────────────────────────────────────────────────────────────
// transactions
// ─────────────────────────────────────────────────────────────────────────────

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    gatewayCode: gatewayCodeEnum("gateway_code").notNull(),

    /** Token/session ID assigned by the payment gateway */
    gatewayTransactionId: text("gateway_transaction_id").notNull(),

    /** Internal marketplace order UUID (nullable for standalone payments) */
    orderId: uuid("order_id"),

    /** Seller's user ID */
    sellerId: uuid("seller_id").notNull(),

    /** Seller's organization UUID */
    organizationId: uuid("organization_id"),

    /** Amount charged to buyer in grosze */
    amountGrosze: integer("amount_grosze").notNull(),

    /** Gateway commission fee in grosze */
    feeGrosze: integer("fee_grosze").notNull().default(0),

    /** Net amount after fee in grosze */
    netGrosze: integer("net_grosze").notNull().default(0),

    currency: currencyEnum("currency").notNull().default("PLN"),

    status: transactionStatusEnum("status").notNull().default("pending"),

    paymentMethod: paymentMethodEnum("payment_method"),

    returnUrl: text("return_url").notNull(),
    notifyUrl: text("notify_url").notNull(),

    description: text("description").notNull(),

    /** ISO 639-1 language code */
    language: text("language").notNull().default("pl"),

    /** Arbitrary gateway-specific data (webhook payload, extra fields) */
    gatewayMetadata: jsonb("gateway_metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    completedAt: timestamp("completed_at", { withTimezone: true }),

    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => ({
    sellerIdIdx: index("transactions_seller_id_idx").on(t.sellerId),
    orderIdIdx: index("transactions_order_id_idx").on(t.orderId),
    statusIdx: index("transactions_status_idx").on(t.status),
    createdAtIdx: index("transactions_created_at_idx").on(t.createdAt),
    gatewayCodeIdx: index("transactions_gateway_code_idx").on(t.gatewayCode),
    gatewayTxIdUidx: uniqueIndex("transactions_gateway_tx_id_uidx").on(
      t.gatewayCode,
      t.gatewayTransactionId,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// refunds
// ─────────────────────────────────────────────────────────────────────────────

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "restrict" }),

    gatewayCode: gatewayCodeEnum("gateway_code").notNull(),

    /** Refund identifier assigned by the gateway (nullable until processed) */
    gatewayRefundId: text("gateway_refund_id"),

    /** Refund amount in grosze */
    amountGrosze: integer("amount_grosze").notNull(),

    currency: currencyEnum("currency").notNull().default("PLN"),

    status: refundStatusEnum("status").notNull().default("pending"),

    reason: text("reason").notNull(),

    /** Whether a KSeF credit note (faktura korygujaca) has been issued */
    creditNoteIssued: boolean("credit_note_issued").notNull().default(false),

    /** Reference to KSeF invoice service credit note UUID */
    creditNoteId: uuid("credit_note_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    transactionIdIdx: index("refunds_transaction_id_idx").on(t.transactionId),
    statusIdx: index("refunds_status_idx").on(t.status),
    gatewayRefundIdIdx: index("refunds_gateway_refund_id_idx").on(t.gatewayRefundId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// reconciliation_reports
// ─────────────────────────────────────────────────────────────────────────────

export const reconciliationReports = pgTable(
  "reconciliation_reports",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** The calendar date being reconciled (YYYY-MM-DD) */
    reconciledDate: text("reconciled_date").notNull(),

    /** Null = platform-wide report; set = seller-scoped report */
    sellerId: uuid("seller_id"),

    totalOrders: integer("total_orders").notNull().default(0),
    totalTransactions: integer("total_transactions").notNull().default(0),
    totalInvoices: integer("total_invoices").notNull().default(0),
    matchedCount: integer("matched_count").notNull().default(0),
    discrepancyCount: integer("discrepancy_count").notNull().default(0),

    /** JSONB array of ReconciliationDiscrepancy objects */
    discrepancies: jsonb("discrepancies")
      .notNull()
      .default(sql`'[]'::jsonb`),

    /** Total gross revenue in grosze */
    totalRevenueGrosze: integer("total_revenue_grosze").notNull().default(0),

    /** Total gateway fees in grosze */
    totalFeesGrosze: integer("total_fees_grosze").notNull().default(0),

    /** Net revenue after fees in grosze */
    totalNetGrosze: integer("total_net_grosze").notNull().default(0),

    status: reconciliationStatusEnum("status").notNull().default("pending"),

    errorMessage: text("error_message"),

    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    dateIdx: index("reconciliation_reports_date_idx").on(t.reconciledDate),
    sellerIdx: index("reconciliation_reports_seller_idx").on(t.sellerId),
    statusIdx: index("reconciliation_reports_status_idx").on(t.status),
    dateSellerUidx: uniqueIndex("reconciliation_reports_date_seller_uidx").on(
      t.reconciledDate,
      t.sellerId,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// gateway_credentials
// Stores gateway API keys encrypted at rest.
// One record per (seller, gateway) pair.
// ─────────────────────────────────────────────────────────────────────────────

export const gatewayCredentials = pgTable(
  "gateway_credentials",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    sellerId: uuid("seller_id").notNull(),

    gatewayCode: gatewayCodeEnum("gateway_code").notNull(),

    /**
     * Encrypted JSON object containing gateway-specific keys.
     * Encrypted with AES-256-GCM using CREDENTIALS_ENCRYPTION_KEY.
     * Structure depends on gateway (e.g. { merchantId, crcKey, reportKey }).
     */
    encryptedCredentials: text("encrypted_credentials").notNull(),

    /** Whether this credential set is currently active */
    isActive: boolean("is_active").notNull().default(true),

    /** Whether these are sandbox/test credentials */
    isSandbox: boolean("is_sandbox").notNull().default(false),

    /** Commission rate override for this seller (decimal, e.g. 0.0129) */
    commissionRateOverride: numeric("commission_rate_override", {
      precision: 6,
      scale: 4,
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    sellerIdx: index("gateway_credentials_seller_idx").on(t.sellerId),
    sellerGatewayUidx: uniqueIndex("gateway_credentials_seller_gateway_uidx").on(
      t.sellerId,
      t.gatewayCode,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Inferred row types
// ─────────────────────────────────────────────────────────────────────────────

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Refund = typeof refunds.$inferSelect;
export type NewRefund = typeof refunds.$inferInsert;
export type ReconciliationReport = typeof reconciliationReports.$inferSelect;
export type NewReconciliationReport = typeof reconciliationReports.$inferInsert;
export type GatewayCredential = typeof gatewayCredentials.$inferSelect;
export type NewGatewayCredential = typeof gatewayCredentials.$inferInsert;
