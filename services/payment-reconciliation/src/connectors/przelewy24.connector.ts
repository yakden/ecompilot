// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — payment-reconciliation
// Przelewy24 Connector — Full implementation
//
// API Reference: https://developers.przelewy24.pl/index.php?en
// Production:    https://secure.przelewy24.pl
// Sandbox:       https://sandbox.przelewy24.pl
//
// Auth: HTTP Basic (merchantId:reportKey) + SHA-384 sign field per endpoint
// Amounts in lowest unit: 123 = 1.23 PLN
// Commission: 1.29% + 0.30 PLN fixed
// Multi-currency: PLN, EUR, GBP, CZK
// ─────────────────────────────────────────────────────────────────────────────

import { createHash, timingSafeEqual } from "node:crypto";
import type {
  PaymentGatewayConnector,
  GatewayCapabilities,
  CreateTransactionInput,
  CreateTransactionResult,
  VerifyTransactionInput,
  VerifyTransactionResult,
  RefundTransactionInput,
  RefundTransactionResult,
  BlikPaymentInput,
  BlikPaymentResult,
  WebhookVerificationInput,
  ParsedWebhookPayload,
  PaymentMethod,
  TransactionStatus,
  SupportedCurrency,
} from "../types/payment.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCTION_BASE_URL = "https://secure.przelewy24.pl";
const SANDBOX_BASE_URL = "https://sandbox.przelewy24.pl";
const API_VERSION = "v3_2";
const COMMISSION_RATE = 0.0129; // 1.29%
const FIXED_FEE_GROSZE = 30; // 0.30 PLN

// ─────────────────────────────────────────────────────────────────────────────
// P24 API response shapes
// ─────────────────────────────────────────────────────────────────────────────

interface P24RegisterResponse {
  data: {
    token: string;
  };
}

interface P24TransactionBySessionIdResponse {
  data: {
    orderId: number;
    sessionId: string;
    status: number;
    amount: number;
    currency: string;
    description: string;
    email: string;
    methodId: number;
    statement: string;
  };
}

interface P24RefundResponse {
  data: {
    requestId: string;
    refundsUuid: string;
    responseCode: number;
  };
}

interface P24ErrorResponse {
  error: string;
  code: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// P24 status code → internal status mapping
// Reference: https://developers.przelewy24.pl/index.php?en#tag/Transaction-data/paths/~1api~1v1~1transaction~1by~1sessionId~1{sessionId}/get
// ─────────────────────────────────────────────────────────────────────────────

const P24_STATUS_MAP: Readonly<Record<number, TransactionStatus>> = {
  0: "pending",
  1: "completed",
  2: "cancelled",
  3: "failed",
  4: "waiting_for_payment",
  5: "processing",
};

// ─────────────────────────────────────────────────────────────────────────────
// P24 method code → internal PaymentMethod mapping
// ─────────────────────────────────────────────────────────────────────────────

const P24_METHOD_MAP: Readonly<Record<number, PaymentMethod>> = {
  1: "card",        // Visa/Mastercard
  25: "blik",       // BLIK
  154: "blik",      // BLIK (deprecated alias kept by P24)
  69: "pbl",        // Pay-by-link
  178: "pbl",       // Pay-by-link (bank)
};

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface Przelewy24Config {
  /** Merchant ID (numeric) */
  readonly merchantId: number;
  /** POS ID — usually same as merchantId unless separate POS is configured */
  readonly posId: number;
  /** CRC key (used for SHA-384 signing of registration requests) */
  readonly crcKey: string;
  /** Report key (used as HTTP Basic Auth password) */
  readonly reportKey: string;
  readonly sandbox: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connector
// ─────────────────────────────────────────────────────────────────────────────

export class Przelewy24Connector implements PaymentGatewayConnector {
  readonly capabilities: GatewayCapabilities = {
    code: "przelewy24",
    displayName: "Przelewy24",
    supportsBlik: true,
    supportsBlikRecurring: false,
    supportsCards: true,
    supportsBNPL: false,
    supportsB2BBNPL: false,
    supportsMultiCurrency: true,
    supportedCurrencies: ["PLN", "EUR", "GBP", "CZK"],
    supportsMarketplaceSplit: false,
    webhookRetries: 3,
    commissionRate: COMMISSION_RATE,
    fixedFeeGrosze: FIXED_FEE_GROSZE,
    isActive: true,
    reliabilityScore: 94,
  };

  private readonly baseUrl: string;
  private readonly config: Przelewy24Config;

  constructor(config: Przelewy24Config) {
    this.config = config;
    this.baseUrl = config.sandbox ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL;
  }

  // ── SHA-384 registration sign ─────────────────────────────────────────────
  //
  // sign = SHA384( JSON({ sessionId, merchantId, amount, currency, crc }) )
  // Przelewy24 docs §Transaction Registration

  private buildRegistrationSign(params: {
    sessionId: string;
    merchantId: number;
    amount: number;
    currency: string;
  }): string {
    const payload = JSON.stringify({
      sessionId: params.sessionId,
      merchantId: params.merchantId,
      amount: params.amount,
      currency: params.currency,
      crc: this.config.crcKey,
    });
    return createHash("sha384").update(payload).digest("hex");
  }

  // ── SHA-384 verification sign ─────────────────────────────────────────────
  //
  // sign = SHA384( JSON({ sessionId, orderId, amount, currency, crc }) )
  // Przelewy24 docs §Transaction Verification

  private buildVerifySign(params: {
    sessionId: string;
    orderId: number;
    amount: number;
    currency: string;
  }): string {
    const payload = JSON.stringify({
      sessionId: params.sessionId,
      orderId: params.orderId,
      amount: params.amount,
      currency: params.currency,
      crc: this.config.crcKey,
    });
    return createHash("sha384").update(payload).digest("hex");
  }

  // ── Webhook notification sign ─────────────────────────────────────────────
  //
  // sign = SHA384( JSON({ merchantId, posId, sessionId, amount, originAmount, currency, orderId, methodId, statement, crc }) )

  private buildWebhookSign(params: {
    merchantId: number;
    posId: number;
    sessionId: string;
    amount: number;
    originAmount: number;
    currency: string;
    orderId: number;
    methodId: number;
    statement: string;
  }): string {
    const payload = JSON.stringify({
      merchantId: params.merchantId,
      posId: params.posId,
      sessionId: params.sessionId,
      amount: params.amount,
      originAmount: params.originAmount,
      currency: params.currency,
      orderId: params.orderId,
      methodId: params.methodId,
      statement: params.statement,
      crc: this.config.crcKey,
    });
    return createHash("sha384").update(payload).digest("hex");
  }

  // ── HTTP client ───────────────────────────────────────────────────────────

  private get basicAuthHeader(): string {
    const credentials = Buffer.from(
      `${this.config.merchantId}:${this.config.reportKey}`,
    ).toString("base64");
    return `Basic ${credentials}`;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/${API_VERSION}${path}`;

    const bodyString = body !== undefined ? JSON.stringify(body) : undefined;
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: this.basicAuthHeader,
      },
      ...(bodyString !== undefined ? { body: bodyString } : {}),
    });

    const json = (await response.json()) as T | P24ErrorResponse;

    if (!response.ok) {
      const err = json as P24ErrorResponse;
      throw new Przelewy24ApiError(
        err.error ?? "Unknown Przelewy24 error",
        err.code ?? response.status,
        response.status,
      );
    }

    return json as T;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // createTransaction
  //
  // POST /api/v3_2/transaction/register
  // Returns a token that forms the redirect URL:
  //   https://secure.przelewy24.pl/trnRequest/{token}
  // ─────────────────────────────────────────────────────────────────────────

  async createTransaction(input: CreateTransactionInput): Promise<CreateTransactionResult> {
    // sessionId is our internal stable identifier for this payment session
    const sessionId = input.orderId ?? crypto.randomUUID();

    const sign = this.buildRegistrationSign({
      sessionId,
      merchantId: this.config.merchantId,
      amount: input.amountGrosze,
      currency: input.currency,
    });

    const body = {
      merchantId: this.config.merchantId,
      posId: this.config.posId,
      sessionId,
      amount: input.amountGrosze,
      currency: input.currency,
      description: input.description.slice(0, 128),
      email: input.customerEmail,
      client: `${input.customerFirstName} ${input.customerLastName}`.trim().slice(0, 50),
      phone: input.customerPhone ?? "",
      country: "PL",
      language: (input.language ?? "pl").slice(0, 2),
      urlReturn: input.returnUrl,
      urlStatus: input.notifyUrl,
      timeLimit: 60, // minutes
      channel: 0, // all payment methods
      encoding: "UTF-8",
      sign,
    };

    const response = await this.request<P24RegisterResponse>(
      "POST",
      "/transaction/register",
      body,
    );

    const token = response.data.token;
    const redirectUrl = `${this.baseUrl}/trnRequest/${token}`;

    return {
      gatewayTransactionId: sessionId,
      redirectUrl,
      status: "waiting_for_payment",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // verifyTransaction
  //
  // POST /api/v3_2/transaction/verify
  // Must be called after webhook fires to confirm funds were captured.
  // ─────────────────────────────────────────────────────────────────────────

  async verifyTransaction(input: VerifyTransactionInput): Promise<VerifyTransactionResult> {
    // First fetch the current transaction state to get the numeric orderId
    // that Przelewy24 assigned (different from our internal sessionId)
    const txResponse = await this.request<P24TransactionBySessionIdResponse>(
      "GET",
      `/transaction/by/sessionId/${encodeURIComponent(input.gatewayTransactionId)}`,
    );

    const txData = txResponse.data;

    // Verify amount matches what we expect (security check)
    if (txData.amount !== input.amountGrosze) {
      return {
        verified: false,
        status: "failed",
        gatewayStatus: `amount_mismatch: expected ${input.amountGrosze}, got ${txData.amount}`,
        paidAmountGrosze: txData.amount,
        paymentMethod: null,
        completedAt: null,
      };
    }

    // If not yet paid, return current status without calling verify
    if (txData.status !== 1) {
      const internalStatus = P24_STATUS_MAP[txData.status] ?? "pending";
      return {
        verified: false,
        status: internalStatus,
        gatewayStatus: String(txData.status),
        paidAmountGrosze: txData.amount,
        paymentMethod: P24_METHOD_MAP[txData.methodId] ?? "pbl",
        completedAt: null,
      };
    }

    const sign = this.buildVerifySign({
      sessionId: input.gatewayTransactionId,
      orderId: txData.orderId,
      amount: txData.amount,
      currency: txData.currency,
    });

    await this.request<{ data: { status: number } }>(
      "PUT",
      "/transaction/verify",
      {
        merchantId: this.config.merchantId,
        posId: this.config.posId,
        sessionId: input.gatewayTransactionId,
        amount: txData.amount,
        currency: txData.currency,
        orderId: txData.orderId,
        sign,
      },
    );

    const paymentMethod = P24_METHOD_MAP[txData.methodId] ?? "pbl";

    return {
      verified: true,
      status: "completed",
      gatewayStatus: "1",
      paidAmountGrosze: txData.amount,
      paymentMethod,
      completedAt: new Date().toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // refundTransaction
  //
  // POST /api/v3_2/transaction/refund
  // Przelewy24 supports partial refunds.
  // ─────────────────────────────────────────────────────────────────────────

  async refundTransaction(input: RefundTransactionInput): Promise<RefundTransactionResult> {
    const requestId = crypto.randomUUID();

    const body = {
      requestId,
      refunds: [
        {
          orderId: 0, // will be ignored — we identify by sessionId
          sessionId: input.gatewayTransactionId,
          amount: input.amountGrosze,
          description: input.reason.slice(0, 128),
        },
      ],
    };

    const response = await this.request<P24RefundResponse>(
      "POST",
      "/transaction/refund",
      body,
    );

    const responseCode = response.data.responseCode;

    if (responseCode !== 0) {
      throw new Przelewy24ApiError(
        `Refund rejected with response code ${responseCode}`,
        responseCode,
        400,
      );
    }

    return {
      gatewayRefundId: response.data.refundsUuid,
      status: "processing",
      amountGrosze: input.amountGrosze,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // processBlik
  //
  // Przelewy24 supports BLIK as a payment channel (methodId 25).
  // The buyer selects BLIK on the hosted payment page, so we redirect them.
  // For headless BLIK (code submitted directly), we use the BLIK endpoint.
  //
  // POST /api/v3_2/transaction/blik
  // ─────────────────────────────────────────────────────────────────────────

  async processBlik(input: BlikPaymentInput): Promise<BlikPaymentResult> {
    const body = {
      merchantId: this.config.merchantId,
      posId: this.config.posId,
      sessionId: input.gatewayTransactionId,
      blikCode: input.blikCode,
    };

    await this.request<{ data: { status: string } }>(
      "POST",
      "/transaction/blik",
      body,
    );

    return {
      status: "processing",
      requiresRedirect: false,
      redirectUrl: null,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // verifyWebhook
  //
  // Przelewy24 sends a POST notification with:
  //   { merchantId, posId, sessionId, amount, originAmount, currency,
  //     orderId, methodId, statement, sign }
  //
  // We recompute the sign and compare with timingSafeEqual.
  // ─────────────────────────────────────────────────────────────────────────

  async verifyWebhook(input: WebhookVerificationInput): Promise<boolean> {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(input.rawBody.toString("utf8")) as Record<string, unknown>;
    } catch {
      return false;
    }

    const {
      merchantId,
      posId,
      sessionId,
      amount,
      originAmount,
      currency,
      orderId,
      methodId,
      statement,
      sign: receivedSign,
    } = body;

    if (
      typeof merchantId !== "number" ||
      typeof posId !== "number" ||
      typeof sessionId !== "string" ||
      typeof amount !== "number" ||
      typeof originAmount !== "number" ||
      typeof currency !== "string" ||
      typeof orderId !== "number" ||
      typeof methodId !== "number" ||
      typeof statement !== "string" ||
      typeof receivedSign !== "string"
    ) {
      return false;
    }

    const expectedSign = this.buildWebhookSign({
      merchantId,
      posId,
      sessionId,
      amount,
      originAmount,
      currency,
      orderId,
      methodId,
      statement,
    });

    const expected = Buffer.from(expectedSign, "utf8");
    const received = Buffer.from(receivedSign, "utf8");

    if (expected.length !== received.length) {
      return false;
    }

    return timingSafeEqual(expected, received);
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
      throw new Error("Przelewy24 webhook: invalid JSON body");
    }

    const sessionId = body["sessionId"];
    const amount = body["amount"];
    const currency = body["currency"];
    const methodId = body["methodId"];
    const p24Status = body["status"];

    if (typeof sessionId !== "string") {
      throw new Error("Przelewy24 webhook: missing sessionId");
    }

    const internalStatus: TransactionStatus =
      typeof p24Status === "number"
        ? (P24_STATUS_MAP[p24Status] ?? "pending")
        : "pending";

    const paymentMethod: PaymentMethod | null =
      typeof methodId === "number"
        ? (P24_METHOD_MAP[methodId] ?? "pbl")
        : null;

    return {
      gatewayTransactionId: sessionId,
      orderId: null, // orderId in P24 context is their numeric ID, not our UUID
      status: internalStatus,
      paidAmountGrosze: typeof amount === "number" ? amount : null,
      currency: isValidCurrency(currency) ? currency : null,
      paymentMethod,
      rawPayload: body,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom error
// ─────────────────────────────────────────────────────────────────────────────

export class Przelewy24ApiError extends Error {
  readonly code: number;
  readonly httpStatus: number;

  constructor(message: string, code: number, httpStatus: number) {
    super(`Przelewy24 API error [${code}]: ${message}`);
    this.name = "Przelewy24ApiError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const VALID_CURRENCIES = new Set<string>(["PLN", "EUR", "GBP", "CZK"]);

function isValidCurrency(value: unknown): value is SupportedCurrency {
  return typeof value === "string" && VALID_CURRENCIES.has(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createPrzelewy24Connector(config: Przelewy24Config): Przelewy24Connector {
  return new Przelewy24Connector(config);
}
