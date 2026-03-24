// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — payment-reconciliation
// Core payment domain types
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Gateway identifiers
// ─────────────────────────────────────────────────────────────────────────────

export type GatewayCode =
  | "przelewy24"
  | "payu"
  | "tpay"
  | "paynow"
  | "imoje";

// ─────────────────────────────────────────────────────────────────────────────
// Supported currencies per gateway
// ─────────────────────────────────────────────────────────────────────────────

export type SupportedCurrency = "PLN" | "EUR" | "GBP" | "USD" | "CZK";

// ─────────────────────────────────────────────────────────────────────────────
// Gateway capabilities descriptor
// ─────────────────────────────────────────────────────────────────────────────

export interface GatewayCapabilities {
  /** Gateway identifier */
  readonly code: GatewayCode;
  /** Human-readable name */
  readonly displayName: string;
  /** BLIK (Polish instant mobile payment) */
  readonly supportsBlik: boolean;
  /** BLIK Level 0 / recurring token payments */
  readonly supportsBlikRecurring: boolean;
  /** Card payments (Visa/Mastercard) */
  readonly supportsCards: boolean;
  /** Buy Now Pay Later (B2C) */
  readonly supportsBNPL: boolean;
  /** B2B Buy Now Pay Later (e.g. PragmaGO via imoje) */
  readonly supportsB2BBNPL: boolean;
  /** Multiple currencies beyond PLN */
  readonly supportsMultiCurrency: boolean;
  /** Supported currencies list */
  readonly supportedCurrencies: readonly SupportedCurrency[];
  /** Marketplace split payments (payout to multiple sellers) */
  readonly supportsMarketplaceSplit: boolean;
  /** Number of webhook retry attempts */
  readonly webhookRetries: number;
  /** Commission rate as decimal (e.g. 0.0129 = 1.29%) */
  readonly commissionRate: number;
  /** Fixed fee per transaction in grosze (e.g. 30 = 0.30 PLN) */
  readonly fixedFeeGrosze: number;
  /** Whether this gateway is currently active/enabled */
  readonly isActive: boolean;
  /** Relative reliability score 0-100 */
  readonly reliabilityScore: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Money — amounts always stored in lowest unit (grosze for PLN)
// ─────────────────────────────────────────────────────────────────────────────

export interface Money {
  /** Amount in lowest unit (grosze, euro cents, etc.) */
  readonly amountGrosze: number;
  readonly currency: SupportedCurrency;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction
// ─────────────────────────────────────────────────────────────────────────────

export type TransactionStatus =
  | "pending"
  | "waiting_for_payment"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "refunded"
  | "partially_refunded"
  | "disputed"
  | "chargeback";

export type PaymentMethod =
  | "blik"
  | "blik_recurring"
  | "card"
  | "bank_transfer"
  | "pbl" // pay-by-link
  | "installments"
  | "bnpl"
  | "b2b_bnpl"
  | "apple_pay"
  | "google_pay";

export interface Transaction {
  readonly id: string;
  readonly gatewayCode: GatewayCode;
  /** Gateway-assigned transaction/session token */
  readonly gatewayTransactionId: string;
  /** Link to internal marketplace order */
  readonly orderId: string | null;
  readonly sellerId: string;
  readonly organizationId: string | null;
  /** Amount charged to buyer in grosze */
  readonly amountGrosze: number;
  /** Commission fee in grosze */
  readonly feeGrosze: number;
  /** Net amount (amount - fee) in grosze */
  readonly netGrosze: number;
  readonly currency: SupportedCurrency;
  readonly status: TransactionStatus;
  readonly paymentMethod: PaymentMethod | null;
  /** Redirect URL after successful payment */
  readonly returnUrl: string;
  /** Gateway webhook notification URL */
  readonly notifyUrl: string;
  readonly description: string;
  /** ISO 639-1 language code for payment page */
  readonly language: string;
  /** Raw gateway-specific metadata */
  readonly gatewayMetadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly expiresAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// BLIK-specific request
// ─────────────────────────────────────────────────────────────────────────────

export interface BlikPaymentRequest {
  readonly transactionId: string;
  /** 6-digit BLIK code entered by the user */
  readonly blikCode: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Refund
// ─────────────────────────────────────────────────────────────────────────────

export type RefundStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface Refund {
  readonly id: string;
  readonly transactionId: string;
  readonly gatewayCode: GatewayCode;
  /** Gateway-assigned refund identifier */
  readonly gatewayRefundId: string | null;
  /** Refund amount in grosze */
  readonly amountGrosze: number;
  readonly currency: SupportedCurrency;
  readonly status: RefundStatus;
  /** Reason for refund (free text, shown to gateway) */
  readonly reason: string;
  /** Whether a credit note (faktura korygujaca) was issued via KSeF */
  readonly creditNoteIssued: boolean;
  readonly creditNoteId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation
// ─────────────────────────────────────────────────────────────────────────────

export type DiscrepancyType =
  | "order_without_payment"
  | "payment_without_order"
  | "amount_mismatch"
  | "missing_b2b_invoice"
  | "refund_without_credit_note"
  | "duplicate_payment"
  | "currency_mismatch"
  | "status_mismatch";

export interface ReconciliationDiscrepancy {
  readonly type: DiscrepancyType;
  readonly orderId: string | null;
  readonly transactionId: string | null;
  readonly invoiceId: string | null;
  readonly expectedAmountGrosze: number | null;
  readonly actualAmountGrosze: number | null;
  readonly details: string;
}

export interface ReconciliationReport {
  readonly id: string;
  readonly reportDate: string;
  /** ISO date string for the day being reconciled (YYYY-MM-DD) */
  readonly reconciledDate: string;
  readonly sellerId: string | null;
  /** Total orders fetched from marketplace-hub */
  readonly totalOrders: number;
  /** Total payment transactions fetched from gateways */
  readonly totalTransactions: number;
  /** Total invoices fetched from ksef-service */
  readonly totalInvoices: number;
  /** Successfully matched order-payment-invoice triplets */
  readonly matchedCount: number;
  /** Number of discrepancies found */
  readonly discrepancyCount: number;
  readonly discrepancies: ReconciliationDiscrepancy[];
  /** Total gross revenue in grosze */
  readonly totalRevenueGrosze: number;
  /** Total gateway fees in grosze */
  readonly totalFeesGrosze: number;
  /** Net revenue after fees in grosze */
  readonly totalNetGrosze: number;
  readonly status: "pending" | "completed" | "failed";
  readonly errorMessage: string | null;
  readonly generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway connector interface — contract for all payment integrations
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateTransactionInput {
  readonly orderId: string | null;
  readonly sellerId: string;
  readonly amountGrosze: number;
  readonly currency: SupportedCurrency;
  readonly description: string;
  readonly customerEmail: string;
  readonly customerFirstName: string;
  readonly customerLastName: string;
  readonly customerPhone: string | null;
  readonly returnUrl: string;
  readonly notifyUrl: string;
  readonly language?: string;
  readonly metadata?: Record<string, string>;
}

export interface CreateTransactionResult {
  readonly gatewayTransactionId: string;
  /** URL to redirect the buyer to for payment */
  readonly redirectUrl: string;
  readonly status: TransactionStatus;
  readonly expiresAt: string | null;
}

export interface VerifyTransactionInput {
  readonly gatewayTransactionId: string;
  readonly orderId: string;
  readonly amountGrosze: number;
  readonly currency: SupportedCurrency;
}

export interface VerifyTransactionResult {
  readonly verified: boolean;
  readonly status: TransactionStatus;
  readonly gatewayStatus: string;
  readonly paidAmountGrosze: number;
  readonly paymentMethod: PaymentMethod | null;
  readonly completedAt: string | null;
}

export interface RefundTransactionInput {
  readonly gatewayTransactionId: string;
  readonly amountGrosze: number;
  readonly currency: SupportedCurrency;
  readonly reason: string;
}

export interface RefundTransactionResult {
  readonly gatewayRefundId: string;
  readonly status: RefundStatus;
  readonly amountGrosze: number;
}

export interface BlikPaymentInput {
  readonly gatewayTransactionId: string;
  readonly blikCode: string;
  readonly customerEmail: string;
}

export interface BlikPaymentResult {
  readonly status: TransactionStatus;
  readonly requiresRedirect: boolean;
  readonly redirectUrl: string | null;
}

export interface CreateRecurringPaymentInput {
  readonly recurringToken: string;
  readonly orderId: string | null;
  readonly sellerId: string;
  readonly amountGrosze: number;
  readonly currency: SupportedCurrency;
  readonly description: string;
  readonly customerEmail: string;
  readonly notifyUrl: string;
}

export interface CreateRecurringPaymentResult {
  readonly gatewayTransactionId: string;
  readonly status: TransactionStatus;
}

export interface WebhookVerificationInput {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly rawBody: Buffer;
}

export interface ParsedWebhookPayload {
  readonly gatewayTransactionId: string;
  readonly orderId: string | null;
  readonly status: TransactionStatus;
  readonly paidAmountGrosze: number | null;
  readonly currency: SupportedCurrency | null;
  readonly paymentMethod: PaymentMethod | null;
  readonly rawPayload: Record<string, unknown>;
}

/**
 * Contract every payment gateway connector must satisfy.
 * Optional methods are available only on gateways that declare support
 * via their GatewayCapabilities.
 */
export interface PaymentGatewayConnector {
  readonly capabilities: GatewayCapabilities;

  /** Register a new payment session and get a redirect URL */
  createTransaction(input: CreateTransactionInput): Promise<CreateTransactionResult>;

  /**
   * Verify a payment after the buyer returns or after a webhook fires.
   * For Przelewy24 this calls the /transaction/verify endpoint.
   */
  verifyTransaction(input: VerifyTransactionInput): Promise<VerifyTransactionResult>;

  /** Issue a full or partial refund */
  refundTransaction(input: RefundTransactionInput): Promise<RefundTransactionResult>;

  /**
   * Submit a BLIK code for an already-registered transaction.
   * Only available when capabilities.supportsBlik === true.
   */
  processBlik?(input: BlikPaymentInput): Promise<BlikPaymentResult>;

  /**
   * Initiate a recurring/one-click payment using a stored token.
   * Only available when capabilities.supportsBlikRecurring === true.
   */
  createRecurringPayment?(input: CreateRecurringPaymentInput): Promise<CreateRecurringPaymentResult>;

  /**
   * Validate the authenticity of an incoming webhook notification.
   * Must use constant-time comparison to prevent timing attacks.
   */
  verifyWebhook(input: WebhookVerificationInput): Promise<boolean>;

  /** Parse gateway-specific webhook body into a normalised payload */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<ParsedWebhookPayload>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway credentials — stored encrypted in DB, loaded at runtime
// ─────────────────────────────────────────────────────────────────────────────

export interface GatewayCredentials {
  readonly id: string;
  readonly sellerId: string;
  readonly gatewayCode: GatewayCode;
  readonly credentials: Record<string, string>;
  readonly isActive: boolean;
  readonly isSandbox: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Commission calculation
// ─────────────────────────────────────────────────────────────────────────────

export interface CommissionBreakdown {
  readonly gatewayCode: GatewayCode;
  readonly amountGrosze: number;
  readonly commissionGrosze: number;
  readonly fixedFeeGrosze: number;
  readonly totalFeeGrosze: number;
  readonly netGrosze: number;
  readonly effectiveRatePercent: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway recommendation
// ─────────────────────────────────────────────────────────────────────────────

export interface GatewayRecommendationInput {
  readonly amountGrosze: number;
  readonly currency: SupportedCurrency;
  readonly requiresBlik?: boolean;
  readonly requiresCards?: boolean;
  readonly requiresBNPL?: boolean;
  readonly requiresB2BBNPL?: boolean;
  readonly requiresMarketplaceSplit?: boolean;
  readonly minimiseCommission?: boolean;
}

export interface GatewayRecommendation {
  readonly rank: number;
  readonly gatewayCode: GatewayCode;
  readonly reason: string;
  readonly estimatedFeeGrosze: number;
  readonly effectiveRatePercent: number;
  readonly capabilities: GatewayCapabilities;
}
