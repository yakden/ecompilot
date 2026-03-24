// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — payment-reconciliation
// Paynow Connector — Full implementation
//
// API Reference: https://docs.paynow.pl/
// Production:    https://api.paynow.pl
// Sandbox:       https://api.sandbox.paynow.pl
//
// Auth: Api-Key header + HMAC-SHA256 Signature header (base64)
// Signature body = JSON body string, key = signature key
// PLN only, no BNPL
// 15 webhook retries over 48 hours (every ~3.2h on exponential backoff)
// Lowest commission in Poland: 0.95%
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  PaymentGatewayConnector,
  GatewayCapabilities,
  CreateTransactionInput,
  CreateTransactionResult,
  VerifyTransactionInput,
  VerifyTransactionResult,
  RefundTransactionInput,
  RefundTransactionResult,
  WebhookVerificationInput,
  ParsedWebhookPayload,
  PaymentMethod,
  TransactionStatus,
  SupportedCurrency,
} from "../types/payment.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCTION_BASE_URL = "https://api.paynow.pl";
const SANDBOX_BASE_URL = "https://api.sandbox.paynow.pl";
const API_VERSION = "v1";
const COMMISSION_RATE = 0.0095; // 0.95%
const FIXED_FEE_GROSZE = 0; // No fixed fee — lowest cost gateway

// ─────────────────────────────────────────────────────────────────────────────
// Paynow API response shapes
// ─────────────────────────────────────────────────────────────────────────────

interface PaynowPaymentResponse {
  paymentId: string;
  status: PaynowStatus;
  redirectUrl: string;
}

interface PaynowPaymentStatusResponse {
  paymentId: string;
  externalId: string;
  status: PaynowStatus;
  amount: number;
  currency: string;
  paymentMethodCode: string;
  createdAt: string;
  modifiedAt: string;
}

interface PaynowRefundResponse {
  refundId: string;
  status: PaynowRefundStatus;
  amount: number;
}

interface PaynowErrorResponse {
  errors: Array<{
    type: string;
    message: string;
    field?: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paynow status enums
// Reference: https://docs.paynow.pl/#tag/Payment-Methods/paths/~1v1~1payments~1{paymentId}~1status/get
// ─────────────────────────────────────────────────────────────────────────────

type PaynowStatus =
  | "NEW"
  | "PENDING"
  | "CONFIRMED"
  | "ERROR"
  | "REJECTED"
  | "EXPIRED"
  | "ABANDONED";

type PaynowRefundStatus =
  | "PENDING"
  | "SUCCESSFUL"
  | "FAILED";

const PAYNOW_STATUS_MAP: Readonly<Record<PaynowStatus, TransactionStatus>> = {
  NEW: "waiting_for_payment",
  PENDING: "processing",
  CONFIRMED: "completed",
  ERROR: "failed",
  REJECTED: "failed",
  EXPIRED: "cancelled",
  ABANDONED: "cancelled",
};

const PAYNOW_REFUND_STATUS_MAP: Readonly<Record<PaynowRefundStatus, "pending" | "completed" | "failed">> = {
  PENDING: "pending",
  SUCCESSFUL: "completed",
  FAILED: "failed",
};

// ─────────────────────────────────────────────────────────────────────────────
// Payment method code → internal PaymentMethod mapping
// Reference: https://docs.paynow.pl/#tag/Payment-Methods
// ─────────────────────────────────────────────────────────────────────────────

const PAYNOW_METHOD_MAP: Readonly<Record<string, PaymentMethod>> = {
  BLIK: "blik",
  BLIK_CODE: "blik",
  BLIK_ONECLICK: "blik_recurring",
  CARD: "card",
  PBL: "pbl",
  BANK_TRANSFER: "bank_transfer",
  APPLE_PAY: "apple_pay",
  GOOGLE_PAY: "google_pay",
};

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface PaynowConfig {
  /** API Key from Paynow merchant panel */
  readonly apiKey: string;
  /** Signature Key — used for HMAC-SHA256 request and webhook signing */
  readonly signatureKey: string;
  readonly sandbox: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connector
// ─────────────────────────────────────────────────────────────────────────────

export class PaynowConnector implements PaymentGatewayConnector {
  readonly capabilities: GatewayCapabilities = {
    code: "paynow",
    displayName: "Paynow",
    supportsBlik: true,
    supportsBlikRecurring: true,
    supportsCards: true,
    supportsBNPL: false,
    supportsB2BBNPL: false,
    supportsMultiCurrency: false,
    supportedCurrencies: ["PLN"],
    supportsMarketplaceSplit: false,
    webhookRetries: 15,
    commissionRate: COMMISSION_RATE,
    fixedFeeGrosze: FIXED_FEE_GROSZE,
    isActive: true,
    reliabilityScore: 90,
  };

  private readonly baseUrl: string;
  private readonly config: PaynowConfig;

  constructor(config: PaynowConfig) {
    this.config = config;
    this.baseUrl = config.sandbox ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL;
  }

  // ── HMAC-SHA256 signature ─────────────────────────────────────────────────
  //
  // Paynow requires an HMAC-SHA256 signature of the request body (JSON string).
  // The result is base64-encoded and sent in the Signature header.
  //
  // Paynow also signs outgoing webhook notifications the same way,
  // allowing us to verify authenticity with timingSafeEqual.

  private computeSignature(payload: string): string {
    return createHmac("sha256", this.config.signatureKey)
      .update(payload, "utf8")
      .digest("base64");
  }

  // ── Idempotency key ───────────────────────────────────────────────────────
  //
  // Paynow requires an Idempotency-Key header to prevent duplicate payments.
  // We derive it deterministically from orderId so retries are safe.

  private idempotencyKey(orderId: string | null): string {
    return orderId ?? crypto.randomUUID();
  }

  // ── HTTP client ───────────────────────────────────────────────────────────

  private async request<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const url = `${this.baseUrl}/${API_VERSION}${path}`;
    const bodyString = body !== undefined ? JSON.stringify(body) : undefined;
    const signature = bodyString !== undefined
      ? this.computeSignature(bodyString)
      : undefined;

    const headers: Record<string, string> = {
      "Api-Key": this.config.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (signature !== undefined) {
      headers["Signature"] = signature;
    }

    if (idempotencyKey !== undefined) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const response = await fetch(url, {
      method,
      headers,
      ...(bodyString !== undefined ? { body: bodyString } : {}),
    });

    // 204 No Content — e.g. some status endpoints
    if (response.status === 204) {
      return {} as T;
    }

    const json = (await response.json()) as T | PaynowErrorResponse;

    if (!response.ok) {
      const err = json as PaynowErrorResponse;
      const messages = err.errors?.map((e) => e.message).join("; ") ?? "Unknown error";
      throw new PaynowApiError(messages, response.status);
    }

    return json as T;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // createTransaction
  //
  // POST /v1/payments
  // Returns paymentId + redirectUrl
  // ─────────────────────────────────────────────────────────────────────────

  async createTransaction(input: CreateTransactionInput): Promise<CreateTransactionResult> {
    if (input.currency !== "PLN") {
      throw new PaynowApiError(
        `Paynow only supports PLN, received: ${input.currency}`,
        422,
      );
    }

    const idKey = this.idempotencyKey(input.orderId);

    const body = {
      amount: input.amountGrosze,
      currency: "PLN",
      externalId: input.orderId ?? idKey,
      description: input.description.slice(0, 255),
      buyer: {
        email: input.customerEmail,
        firstName: input.customerFirstName,
        lastName: input.customerLastName,
        phone: input.customerPhone ?? undefined,
      },
      continueUrl: input.returnUrl,
    };

    const response = await this.request<PaynowPaymentResponse>(
      "POST",
      "/payments",
      body,
      idKey,
    );

    return {
      gatewayTransactionId: response.paymentId,
      redirectUrl: response.redirectUrl,
      status: PAYNOW_STATUS_MAP[response.status] ?? "waiting_for_payment",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // verifyTransaction
  //
  // GET /v1/payments/{paymentId}/status
  // ─────────────────────────────────────────────────────────────────────────

  async verifyTransaction(input: VerifyTransactionInput): Promise<VerifyTransactionResult> {
    const response = await this.request<PaynowPaymentStatusResponse>(
      "GET",
      `/payments/${encodeURIComponent(input.gatewayTransactionId)}/status`,
    );

    const internalStatus = PAYNOW_STATUS_MAP[response.status as PaynowStatus] ?? "pending";
    const verified = internalStatus === "completed";

    // Amount check — guard against partial payment scenarios
    if (verified && response.amount !== input.amountGrosze) {
      return {
        verified: false,
        status: "failed",
        gatewayStatus: response.status,
        paidAmountGrosze: response.amount,
        paymentMethod: resolvePaynowMethod(response.paymentMethodCode),
        completedAt: response.modifiedAt,
      };
    }

    return {
      verified,
      status: internalStatus,
      gatewayStatus: response.status,
      paidAmountGrosze: response.amount,
      paymentMethod: resolvePaynowMethod(response.paymentMethodCode),
      completedAt: verified ? response.modifiedAt : null,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // refundTransaction
  //
  // POST /v1/payments/{paymentId}/refunds
  // Supports full and partial refunds.
  // ─────────────────────────────────────────────────────────────────────────

  async refundTransaction(input: RefundTransactionInput): Promise<RefundTransactionResult> {
    const idempotencyKey = crypto.randomUUID();

    const body = {
      amount: input.amountGrosze,
      reason: input.reason.slice(0, 255),
    };

    const response = await this.request<PaynowRefundResponse>(
      "POST",
      `/payments/${encodeURIComponent(input.gatewayTransactionId)}/refunds`,
      body,
      idempotencyKey,
    );

    const status = PAYNOW_REFUND_STATUS_MAP[response.status as PaynowRefundStatus] ?? "pending";

    return {
      gatewayRefundId: response.refundId,
      status,
      amountGrosze: response.amount,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // verifyWebhook
  //
  // Paynow webhook POST body:
  //   { paymentId, externalId, status, modifiedAt, ... }
  //
  // Paynow signs the notification body with the same HMAC-SHA256 + base64
  // algorithm and sends it in the "Signature" header.
  //
  // We use timingSafeEqual to prevent timing attacks.
  // ─────────────────────────────────────────────────────────────────────────

  async verifyWebhook(input: WebhookVerificationInput): Promise<boolean> {
    const rawSignature = input.headers["signature"] ?? input.headers["Signature"];
    const receivedSignature = Array.isArray(rawSignature)
      ? rawSignature[0]
      : rawSignature;

    if (typeof receivedSignature !== "string" || receivedSignature.length === 0) {
      return false;
    }

    const bodyString = input.rawBody.toString("utf8");
    const expectedSignature = this.computeSignature(bodyString);

    const expectedBuf = Buffer.from(expectedSignature, "base64");
    const receivedBuf = Buffer.from(receivedSignature, "base64");

    if (expectedBuf.length !== receivedBuf.length) {
      return false;
    }

    return timingSafeEqual(expectedBuf, receivedBuf);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // parseWebhook
  // ─────────────────────────────────────────────────────────────────────────

  async parseWebhook(
    rawBody: Buffer,
    _headers: Record<string, string | string[] | undefined>,
  ): Promise<ParsedWebhookPayload> {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
    } catch {
      throw new Error("Paynow webhook: invalid JSON body");
    }

    const paymentId = body["paymentId"];
    const externalId = body["externalId"];
    const status = body["status"];
    const amount = body["amount"];
    const currency = body["currency"];
    const paymentMethodCode = body["paymentMethodCode"];

    if (typeof paymentId !== "string") {
      throw new Error("Paynow webhook: missing paymentId");
    }

    const internalStatus: TransactionStatus =
      typeof status === "string"
        ? (PAYNOW_STATUS_MAP[status as PaynowStatus] ?? "pending")
        : "pending";

    return {
      gatewayTransactionId: paymentId,
      orderId: typeof externalId === "string" ? externalId : null,
      status: internalStatus,
      paidAmountGrosze: typeof amount === "number" ? amount : null,
      currency: isValidCurrency(currency) ? currency : null,
      paymentMethod: typeof paymentMethodCode === "string"
        ? resolvePaynowMethod(paymentMethodCode)
        : null,
      rawPayload: body,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom error
// ─────────────────────────────────────────────────────────────────────────────

export class PaynowApiError extends Error {
  readonly httpStatus: number;

  constructor(message: string, httpStatus: number) {
    super(`Paynow API error [${httpStatus}]: ${message}`);
    this.name = "PaynowApiError";
    this.httpStatus = httpStatus;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function resolvePaynowMethod(code: string): PaymentMethod | null {
  return PAYNOW_METHOD_MAP[code.toUpperCase()] ?? null;
}

const VALID_PAYNOW_CURRENCIES = new Set<string>(["PLN"]);

function isValidCurrency(value: unknown): value is SupportedCurrency {
  return typeof value === "string" && VALID_PAYNOW_CURRENCIES.has(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createPaynowConnector(config: PaynowConfig): PaynowConnector {
  return new PaynowConnector(config);
}
