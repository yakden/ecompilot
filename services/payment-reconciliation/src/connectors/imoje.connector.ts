// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — payment-reconciliation
// imoje Connector — Stub
//
// API Reference: https://imoje.pl/dokumentacja/
// Production:    https://api.imoje.pl
// Sandbox:       https://api.sandbox.imoje.pl
//
// Auth: ServiceId + ServiceKey (HMAC-SHA256 per request)
// Commission: ~1.49% for standard; B2B BNPL via PragmaGO integration
// Supports: PLN only for standard payments
//           B2B BNPL (deferred invoicing) via PragmaGO — unique in Polish market
// Bank: ING Bank Śląski (imoje is ING's payment gateway)
//
// B2B BNPL via PragmaGO:
//   - Deferred payment up to 30/60 days for registered companies (NIP required)
//   - PragmaGO assumes credit risk; merchant receives funds immediately
//   - Requires: buyerNip, companyName, orderValue min 500 PLN
// ─────────────────────────────────────────────────────────────────────────────

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
} from "../types/payment.js";

export interface ImojeConfig {
  readonly serviceId: string;
  readonly serviceKey: string;
  readonly merchantId: string;
  readonly sandbox: boolean;
}

/**
 * Extended input for B2B BNPL via PragmaGO.
 * Passed as metadata on CreateTransactionInput when requiresB2BBNPL is true.
 */
export interface ImojeB2BBNPLMetadata {
  /** Polish NIP (tax ID) of the buying company */
  readonly buyerNip: string;
  readonly companyName: string;
  /** Payment deferral period in days (30 or 60) */
  readonly deferralDays: 30 | 60;
}

export class ImojeConnector implements PaymentGatewayConnector {
  readonly capabilities: GatewayCapabilities = {
    code: "imoje",
    displayName: "imoje (ING)",
    supportsBlik: true,
    supportsBlikRecurring: false,
    supportsCards: true,
    supportsBNPL: false,
    supportsB2BBNPL: true, // PragmaGO integration — unique differentiator
    supportsMultiCurrency: false,
    supportedCurrencies: ["PLN"],
    supportsMarketplaceSplit: false,
    webhookRetries: 5,
    commissionRate: 0.0149,
    fixedFeeGrosze: 0,
    isActive: true,
    reliabilityScore: 85,
  };

  constructor(_config: ImojeConfig) {
    // TODO: store config
    // TODO: implement HMAC-SHA256 request signing (serviceId + serviceKey)
    // TODO: implement PragmaGO B2B BNPL sub-flow
  }

  async createTransaction(_input: CreateTransactionInput): Promise<CreateTransactionResult> {
    throw new Error("imoje connector not yet implemented");
  }

  async verifyTransaction(_input: VerifyTransactionInput): Promise<VerifyTransactionResult> {
    throw new Error("imoje connector not yet implemented");
  }

  async refundTransaction(_input: RefundTransactionInput): Promise<RefundTransactionResult> {
    throw new Error("imoje connector not yet implemented");
  }

  async verifyWebhook(_input: WebhookVerificationInput): Promise<boolean> {
    throw new Error("imoje connector not yet implemented");
  }

  async parseWebhook(
    _rawBody: Buffer,
    _headers: Record<string, string | string[] | undefined>,
  ): Promise<ParsedWebhookPayload> {
    throw new Error("imoje connector not yet implemented");
  }
}

export function createImojeConnector(config: ImojeConfig): ImojeConnector {
  return new ImojeConnector(config);
}
