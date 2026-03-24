// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — NATS JetStream Event Contracts
// All events use Zod schemas for runtime validation + TypeScript inference
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitive schemas
// ─────────────────────────────────────────────────────────────────────────────

const UserIdSchema = z.string().uuid().brand("UserId");
const OrganizationIdSchema = z.string().uuid().brand("OrganizationId");
const EventIdSchema = z.string().uuid().brand("EventId");
const CorrelationIdSchema = z.string().uuid().brand("CorrelationId");

const PlanSchema = z.enum(["free", "pro", "business"]);
const LanguageSchema = z.enum(["ru", "pl", "ua", "en"]);
const CurrencySchema = z.enum(["PLN", "EUR", "USD"]);

const MoneySchema = z.object({
  amount: z.number().nonnegative(),
  currency: CurrencySchema,
});

const OrderStatusSchema = z.enum([
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
  "refunded",
]);

const MarketplaceNameSchema = z.enum([
  "allegro",
  "amazon_pl",
  "empik",
  "ceneo",
  "olx",
  "kaufland",
  "etsy",
  "ebay",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Base event envelope — every NATS event extends this
// ─────────────────────────────────────────────────────────────────────────────

const BaseEventSchema = z.object({
  /** Unique event ID (UUID v4) */
  eventId: EventIdSchema,
  /** ISO 8601 timestamp */
  occurredAt: z.string().datetime(),
  /** Trace correlation ID */
  correlationId: CorrelationIdSchema,
  /** Originating service */
  source: z.string(),
  /** Schema version for forward compatibility */
  schemaVersion: z.literal(1).default(1),
});

type BaseEvent = z.infer<typeof BaseEventSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// USER EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export const UserRegisteredEventSchema = BaseEventSchema.extend({
  type: z.literal("user.registered"),
  payload: z.object({
    userId: UserIdSchema,
    email: z.string().email(),
    name: z.string().min(1),
    language: LanguageSchema,
    plan: PlanSchema,
    organizationId: OrganizationIdSchema.nullable(),
    registeredVia: z.enum(["email", "google", "apple", "facebook"]),
    emailVerificationRequired: z.boolean(),
  }),
});

export const UserSubscriptionChangedEventSchema = BaseEventSchema.extend({
  type: z.literal("user.subscription.changed"),
  payload: z.object({
    userId: UserIdSchema,
    organizationId: OrganizationIdSchema.nullable(),
    previousPlan: PlanSchema,
    newPlan: PlanSchema,
    changedAt: z.string().datetime(),
    billingCycleStart: z.string().datetime(),
    billingCycleEnd: z.string().datetime(),
    reason: z.enum(["upgrade", "downgrade", "trial_start", "trial_end", "payment_failed", "manual"]),
  }),
});

export const UserDeletedEventSchema = BaseEventSchema.extend({
  type: z.literal("user.deleted"),
  payload: z.object({
    userId: UserIdSchema,
    email: z.string().email(),
    organizationId: OrganizationIdSchema.nullable(),
    deletedAt: z.string().datetime(),
    reason: z.enum(["self_requested", "admin_action", "gdpr_erasure", "inactivity"]),
    /** Whether to anonymize data (GDPR) or fully delete */
    gdprErasure: z.boolean(),
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export const PaymentSucceededEventSchema = BaseEventSchema.extend({
  type: z.literal("payment.succeeded"),
  payload: z.object({
    paymentId: z.string().uuid(),
    userId: UserIdSchema,
    organizationId: OrganizationIdSchema.nullable(),
    amount: MoneySchema,
    plan: PlanSchema,
    billingPeriod: z.enum(["monthly", "annual"]),
    provider: z.enum(["stripe", "przelewy24", "payu", "blik"]),
    providerPaymentId: z.string(),
    invoiceId: z.string().uuid().nullable(),
    paidAt: z.string().datetime(),
  }),
});

export const PaymentFailedEventSchema = BaseEventSchema.extend({
  type: z.literal("payment.failed"),
  payload: z.object({
    paymentId: z.string().uuid(),
    userId: UserIdSchema,
    organizationId: OrganizationIdSchema.nullable(),
    amount: MoneySchema,
    plan: PlanSchema,
    provider: z.enum(["stripe", "przelewy24", "payu", "blik"]),
    failureReason: z.string(),
    failureCode: z.string().nullable(),
    attemptCount: z.number().int().positive(),
    nextRetryAt: z.string().datetime().nullable(),
    failedAt: z.string().datetime(),
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export const NicheAnalysisCompleteEventSchema = BaseEventSchema.extend({
  type: z.literal("analytics.niche_analysis.complete"),
  payload: z.object({
    analysisId: z.string().uuid(),
    userId: UserIdSchema,
    organizationId: OrganizationIdSchema.nullable(),
    query: z.string().min(1),
    marketplace: MarketplaceNameSchema,
    resultCount: z.number().int().nonnegative(),
    processingTimeMs: z.number().int().nonnegative(),
    completedAt: z.string().datetime(),
    /** S3/MinIO key for full results */
    resultStorageKey: z.string().nullable(),
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export const ContentGenerationCompleteEventSchema = BaseEventSchema.extend({
  type: z.literal("content.generation.complete"),
  payload: z.object({
    generationId: z.string().uuid(),
    userId: UserIdSchema,
    organizationId: OrganizationIdSchema.nullable(),
    contentType: z.enum(["product_title", "description", "bullet_points", "photo", "seo_keywords"]),
    marketplace: MarketplaceNameSchema,
    language: LanguageSchema,
    tokenCount: z.number().int().nonnegative().nullable(),
    modelUsed: z.string(),
    processingTimeMs: z.number().int().nonnegative(),
    completedAt: z.string().datetime(),
    /** S3/MinIO key for generated content */
    contentStorageKey: z.string(),
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMUNITY EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export const CommunityNewReplyEventSchema = BaseEventSchema.extend({
  type: z.literal("community.reply.created"),
  payload: z.object({
    replyId: z.string().uuid(),
    postId: z.string().uuid(),
    threadId: z.string().uuid(),
    authorId: UserIdSchema,
    recipientId: UserIdSchema,
    preview: z.string().max(200),
    createdAt: z.string().datetime(),
    notifyEmail: z.boolean(),
    notifyPush: z.boolean(),
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// MARKETPLACE EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export const MarketplaceOrderCreatedEventSchema = BaseEventSchema.extend({
  type: z.literal("marketplace.order.created"),
  payload: z.object({
    orderId: z.string().uuid(),
    externalOrderId: z.string(),
    userId: UserIdSchema,
    organizationId: OrganizationIdSchema.nullable(),
    marketplace: MarketplaceNameSchema,
    buyerName: z.string(),
    items: z.array(
      z.object({
        sku: z.string(),
        name: z.string(),
        quantity: z.number().int().positive(),
        unitPrice: MoneySchema,
        totalPrice: MoneySchema,
      }),
    ).min(1),
    totalAmount: MoneySchema,
    status: OrderStatusSchema,
    shippingAddress: z.object({
      street: z.string(),
      city: z.string(),
      postalCode: z.string(),
      country: z.string().length(2),
    }),
    createdAt: z.string().datetime(),
  }),
});

export const MarketplaceOrderStatusChangedEventSchema = BaseEventSchema.extend({
  type: z.literal("marketplace.order.status_changed"),
  payload: z.object({
    orderId: z.string().uuid(),
    externalOrderId: z.string(),
    userId: UserIdSchema,
    marketplace: MarketplaceNameSchema,
    previousStatus: OrderStatusSchema,
    newStatus: OrderStatusSchema,
    changedAt: z.string().datetime(),
    reason: z.string().nullable(),
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGISTICS EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export const LogisticsShipmentCreatedEventSchema = BaseEventSchema.extend({
  type: z.literal("logistics.shipment.created"),
  payload: z.object({
    shipmentId: z.string().uuid(),
    orderId: z.string().uuid(),
    userId: UserIdSchema,
    carrier: z.enum(["inpost", "dpd", "dhl", "ups", "gls", "pocztex", "fedex"]),
    trackingNumber: z.string(),
    labelUrl: z.string().url(),
    estimatedDeliveryAt: z.string().datetime().nullable(),
    dimensions: z.object({
      weightKg: z.number().positive(),
      lengthCm: z.number().positive(),
      widthCm: z.number().positive(),
      heightCm: z.number().positive(),
    }).nullable(),
    createdAt: z.string().datetime(),
  }),
});

export const LogisticsTrackingUpdatedEventSchema = BaseEventSchema.extend({
  type: z.literal("logistics.tracking.updated"),
  payload: z.object({
    shipmentId: z.string().uuid(),
    orderId: z.string().uuid(),
    userId: UserIdSchema,
    carrier: z.enum(["inpost", "dpd", "dhl", "ups", "gls", "pocztex", "fedex"]),
    trackingNumber: z.string(),
    trackingStatus: z.enum([
      "label_created",
      "picked_up",
      "in_transit",
      "out_for_delivery",
      "delivered",
      "failed_delivery",
      "returned",
      "exception",
    ]),
    location: z.string().nullable(),
    updatedAt: z.string().datetime(),
    notifyBuyer: z.boolean(),
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// KSEF (Polish e-invoice) EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export const KsefInvoiceCreatedEventSchema = BaseEventSchema.extend({
  type: z.literal("ksef.invoice.created"),
  payload: z.object({
    invoiceId: z.string().uuid(),
    userId: UserIdSchema,
    organizationId: OrganizationIdSchema,
    /** Polish invoice number */
    invoiceNumber: z.string(),
    /** NIP (tax ID) of the seller */
    sellerNip: z.string().regex(/^\d{10}$/),
    /** NIP of the buyer (if B2B) */
    buyerNip: z.string().regex(/^\d{10}$/).nullable(),
    amount: MoneySchema,
    vatAmount: MoneySchema,
    totalAmount: MoneySchema,
    issueDate: z.string().date(),
    dueDate: z.string().date(),
    /** KSeF reference number (after submission) */
    ksefReferenceNumber: z.string().nullable(),
    createdAt: z.string().datetime(),
  }),
});

export const KsefInvoiceAcceptedEventSchema = BaseEventSchema.extend({
  type: z.literal("ksef.invoice.accepted"),
  payload: z.object({
    invoiceId: z.string().uuid(),
    userId: UserIdSchema,
    organizationId: OrganizationIdSchema,
    invoiceNumber: z.string(),
    /** Official KSeF reference number */
    ksefReferenceNumber: z.string(),
    /** KSeF acquisition timestamp */
    ksefTimestamp: z.string().datetime(),
    /** QR code URL for the invoice */
    qrCodeUrl: z.string().url().nullable(),
    acceptedAt: z.string().datetime(),
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT RECONCILIATION EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export const PaymentTransactionCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal("payment_reconciliation.transaction.completed"),
  payload: z.object({
    transactionId: z.string().uuid(),
    userId: UserIdSchema,
    organizationId: OrganizationIdSchema.nullable(),
    orderId: z.string().uuid().nullable(),
    marketplace: MarketplaceNameSchema.nullable(),
    amount: MoneySchema,
    feeAmount: MoneySchema,
    netAmount: MoneySchema,
    provider: z.enum(["stripe", "przelewy24", "payu", "blik", "bank_transfer"]),
    providerTransactionId: z.string(),
    reconciliationStatus: z.enum(["matched", "unmatched", "partial", "disputed"]),
    completedAt: z.string().datetime(),
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Union of all events (discriminated by `type` field)
// ─────────────────────────────────────────────────────────────────────────────

export const AnyEventSchema = z.discriminatedUnion("type", [
  UserRegisteredEventSchema,
  UserSubscriptionChangedEventSchema,
  UserDeletedEventSchema,
  PaymentSucceededEventSchema,
  PaymentFailedEventSchema,
  NicheAnalysisCompleteEventSchema,
  ContentGenerationCompleteEventSchema,
  CommunityNewReplyEventSchema,
  MarketplaceOrderCreatedEventSchema,
  MarketplaceOrderStatusChangedEventSchema,
  LogisticsShipmentCreatedEventSchema,
  LogisticsTrackingUpdatedEventSchema,
  KsefInvoiceCreatedEventSchema,
  KsefInvoiceAcceptedEventSchema,
  PaymentTransactionCompletedEventSchema,
]);

// ─────────────────────────────────────────────────────────────────────────────
// Inferred TypeScript types
// ─────────────────────────────────────────────────────────────────────────────

export type UserRegisteredEvent = z.infer<typeof UserRegisteredEventSchema>;
export type UserSubscriptionChangedEvent = z.infer<typeof UserSubscriptionChangedEventSchema>;
export type UserDeletedEvent = z.infer<typeof UserDeletedEventSchema>;
export type PaymentSucceededEvent = z.infer<typeof PaymentSucceededEventSchema>;
export type PaymentFailedEvent = z.infer<typeof PaymentFailedEventSchema>;
export type NicheAnalysisCompleteEvent = z.infer<typeof NicheAnalysisCompleteEventSchema>;
export type ContentGenerationCompleteEvent = z.infer<typeof ContentGenerationCompleteEventSchema>;
export type CommunityNewReplyEvent = z.infer<typeof CommunityNewReplyEventSchema>;
export type MarketplaceOrderCreatedEvent = z.infer<typeof MarketplaceOrderCreatedEventSchema>;
export type MarketplaceOrderStatusChangedEvent = z.infer<typeof MarketplaceOrderStatusChangedEventSchema>;
export type LogisticsShipmentCreatedEvent = z.infer<typeof LogisticsShipmentCreatedEventSchema>;
export type LogisticsTrackingUpdatedEvent = z.infer<typeof LogisticsTrackingUpdatedEventSchema>;
export type KsefInvoiceCreatedEvent = z.infer<typeof KsefInvoiceCreatedEventSchema>;
export type KsefInvoiceAcceptedEvent = z.infer<typeof KsefInvoiceAcceptedEventSchema>;
export type PaymentTransactionCompletedEvent = z.infer<typeof PaymentTransactionCompletedEventSchema>;
export type AnyEvent = z.infer<typeof AnyEventSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// NATS Subject constants
// Pattern: <domain>.<entity>.<action>
// JetStream stream: ECOMPILOT_EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export const SUBJECTS = {
  // User domain
  USER_REGISTERED: "ecompilot.user.registered",
  USER_SUBSCRIPTION_CHANGED: "ecompilot.user.subscription.changed",
  USER_DELETED: "ecompilot.user.deleted",

  // Payment domain
  PAYMENT_SUCCEEDED: "ecompilot.payment.succeeded",
  PAYMENT_FAILED: "ecompilot.payment.failed",

  // Analytics domain
  NICHE_ANALYSIS_COMPLETE: "ecompilot.analytics.niche_analysis.complete",

  // Content domain
  CONTENT_GENERATION_COMPLETE: "ecompilot.content.generation.complete",

  // Community domain
  COMMUNITY_NEW_REPLY: "ecompilot.community.reply.created",

  // Marketplace domain
  MARKETPLACE_ORDER_CREATED: "ecompilot.marketplace.order.created",
  MARKETPLACE_ORDER_STATUS_CHANGED: "ecompilot.marketplace.order.status_changed",

  // Logistics domain
  LOGISTICS_SHIPMENT_CREATED: "ecompilot.logistics.shipment.created",
  LOGISTICS_TRACKING_UPDATED: "ecompilot.logistics.tracking.updated",

  // KSeF domain
  KSEF_INVOICE_CREATED: "ecompilot.ksef.invoice.created",
  KSEF_INVOICE_ACCEPTED: "ecompilot.ksef.invoice.accepted",

  // Payment reconciliation domain
  PAYMENT_TRANSACTION_COMPLETED: "ecompilot.payment_reconciliation.transaction.completed",
} as const;

export type Subject = (typeof SUBJECTS)[keyof typeof SUBJECTS];

/** Maps each subject to its corresponding event type */
export type SubjectEventMap = {
  [SUBJECTS.USER_REGISTERED]: UserRegisteredEvent;
  [SUBJECTS.USER_SUBSCRIPTION_CHANGED]: UserSubscriptionChangedEvent;
  [SUBJECTS.USER_DELETED]: UserDeletedEvent;
  [SUBJECTS.PAYMENT_SUCCEEDED]: PaymentSucceededEvent;
  [SUBJECTS.PAYMENT_FAILED]: PaymentFailedEvent;
  [SUBJECTS.NICHE_ANALYSIS_COMPLETE]: NicheAnalysisCompleteEvent;
  [SUBJECTS.CONTENT_GENERATION_COMPLETE]: ContentGenerationCompleteEvent;
  [SUBJECTS.COMMUNITY_NEW_REPLY]: CommunityNewReplyEvent;
  [SUBJECTS.MARKETPLACE_ORDER_CREATED]: MarketplaceOrderCreatedEvent;
  [SUBJECTS.MARKETPLACE_ORDER_STATUS_CHANGED]: MarketplaceOrderStatusChangedEvent;
  [SUBJECTS.LOGISTICS_SHIPMENT_CREATED]: LogisticsShipmentCreatedEvent;
  [SUBJECTS.LOGISTICS_TRACKING_UPDATED]: LogisticsTrackingUpdatedEvent;
  [SUBJECTS.KSEF_INVOICE_CREATED]: KsefInvoiceCreatedEvent;
  [SUBJECTS.KSEF_INVOICE_ACCEPTED]: KsefInvoiceAcceptedEvent;
  [SUBJECTS.PAYMENT_TRANSACTION_COMPLETED]: PaymentTransactionCompletedEvent;
};

// ─────────────────────────────────────────────────────────────────────────────
// JetStream stream configuration
// ─────────────────────────────────────────────────────────────────────────────

export const JETSTREAM_CONFIG = {
  streamName: "ECOMPILOT_EVENTS",
  subjects: Object.values(SUBJECTS),
  /** Retention: 7 days */
  maxAge: 7 * 24 * 60 * 60 * 1e9, // nanoseconds
  /** Max message size: 1MB */
  maxMsgSize: 1_048_576,
  storage: "file",
  replicas: 1,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helper: parse and validate an incoming NATS message payload
// ─────────────────────────────────────────────────────────────────────────────

export function parseEvent(raw: unknown): AnyEvent {
  return AnyEventSchema.parse(raw);
}

export function safeParseEvent(
  raw: unknown,
): { success: true; data: AnyEvent } | { success: false; error: z.ZodError } {
  const result = AnyEventSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

// Re-export Zod for convenience (avoids duplicate zod versions in consumers)
export { z } from "zod";
export type { BaseEvent };
