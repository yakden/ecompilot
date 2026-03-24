// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — payment-reconciliation
// Tpay Connector — Stub
//
// API Reference: https://docs.tpay.com/
// Production:    https://api.tpay.com
// Sandbox:       https://openapi.sandbox.tpay.com
//
// Auth: OAuth2 client_credentials → Bearer token
// Commission: ~1.39% + 0.25 PLN
// Supports: PLN, EUR, GBP, USD, CZK (widest multi-currency among Polish gateways)
// Also supports: BLIK, Cards, PayPo (BNPL), Apple Pay, Google Pay
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

export interface TpayConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  /** Merchant email registered in Tpay panel */
  readonly merchantEmail: string;
  readonly sandbox: boolean;
}

export class TpayConnector implements PaymentGatewayConnector {
  readonly capabilities: GatewayCapabilities = {
    code: "tpay",
    displayName: "Tpay",
    supportsBlik: true,
    supportsBlikRecurring: false,
    supportsCards: true,
    supportsBNPL: true,
    supportsB2BBNPL: false,
    supportsMultiCurrency: true,
    supportedCurrencies: ["PLN", "EUR", "GBP", "USD", "CZK"],
    supportsMarketplaceSplit: false,
    webhookRetries: 5,
    commissionRate: 0.0139,
    fixedFeeGrosze: 25,
    isActive: true,
    reliabilityScore: 88,
  };

  constructor(_config: TpayConfig) {
    // TODO: store config, implement OAuth2 token caching
  }

  async createTransaction(_input: CreateTransactionInput): Promise<CreateTransactionResult> {
    throw new Error("Tpay connector not yet implemented");
  }

  async verifyTransaction(_input: VerifyTransactionInput): Promise<VerifyTransactionResult> {
    throw new Error("Tpay connector not yet implemented");
  }

  async refundTransaction(_input: RefundTransactionInput): Promise<RefundTransactionResult> {
    throw new Error("Tpay connector not yet implemented");
  }

  async verifyWebhook(_input: WebhookVerificationInput): Promise<boolean> {
    throw new Error("Tpay connector not yet implemented");
  }

  async parseWebhook(
    _rawBody: Buffer,
    _headers: Record<string, string | string[] | undefined>,
  ): Promise<ParsedWebhookPayload> {
    throw new Error("Tpay connector not yet implemented");
  }
}

export function createTpayConnector(config: TpayConfig): TpayConnector {
  return new TpayConnector(config);
}
