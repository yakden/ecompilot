// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — payment-reconciliation
// PayU Connector — Stub
//
// API Reference: https://developers.payu.com/en/
// Production:    https://secure.payu.com
// Sandbox:       https://secure.snd.payu.com
//
// Auth: OAuth2 client_credentials (clientId + clientSecret → Bearer token)
// Commission: ~1.59% + 0.25 PLN
// Supports: PLN, EUR, CZK, HUF + BLIK + Installments (Raty PayU)
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

export interface PayuConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly posId: string;
  readonly secondKey: string;
  readonly sandbox: boolean;
}

export class PayuConnector implements PaymentGatewayConnector {
  readonly capabilities: GatewayCapabilities = {
    code: "payu",
    displayName: "PayU",
    supportsBlik: true,
    supportsBlikRecurring: false,
    supportsCards: true,
    supportsBNPL: true,
    supportsB2BBNPL: false,
    supportsMultiCurrency: true,
    supportedCurrencies: ["PLN", "EUR", "CZK"],
    supportsMarketplaceSplit: true,
    webhookRetries: 5,
    commissionRate: 0.0159,
    fixedFeeGrosze: 25,
    isActive: true,
    reliabilityScore: 91,
  };

  constructor(_config: PayuConfig) {
    // TODO: store config, implement OAuth2 token caching
  }

  async createTransaction(_input: CreateTransactionInput): Promise<CreateTransactionResult> {
    throw new Error("PayU connector not yet implemented");
  }

  async verifyTransaction(_input: VerifyTransactionInput): Promise<VerifyTransactionResult> {
    throw new Error("PayU connector not yet implemented");
  }

  async refundTransaction(_input: RefundTransactionInput): Promise<RefundTransactionResult> {
    throw new Error("PayU connector not yet implemented");
  }

  async verifyWebhook(_input: WebhookVerificationInput): Promise<boolean> {
    throw new Error("PayU connector not yet implemented");
  }

  async parseWebhook(
    _rawBody: Buffer,
    _headers: Record<string, string | string[] | undefined>,
  ): Promise<ParsedWebhookPayload> {
    throw new Error("PayU connector not yet implemented");
  }
}

export function createPayuConnector(config: PayuConfig): PayuConnector {
  return new PayuConnector(config);
}
