// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — marketplace-hub: Amazon SP-API connector (stub)
//
// Amazon specifics:
//  • LWA (Login with Amazon) OAuth2 + AWS Signature V4 on every request
//  • Poland marketplace ID: A1C3SOZRARQ6R3
//  • Webhooks via SNS/SQS (push model) — hasWebhooks: true
//  • Rate limit: 0.5 req/sec per operation (burst varies per operation)
//  • Full implementation requires: @aws-sdk/signature-v4 + @smithy/protocol-http
//
// This file provides the correct interface and type-safe stub. Full AWS
// Signature V4 implementation is in scope for Phase 2.
// ─────────────────────────────────────────────────────────────────────────────

import type { Logger } from "pino";
import { BaseConnector } from "./base.connector.js";
import { ConnectorError } from "../types/marketplace.js";
import type {
  ConnectorCapabilities,
  ConnectorAuthContext,
  CanonicalProduct,
  CanonicalOrder,
  CanonicalOrderStatus,
  ConnectorOfferResult,
  StockUpdate,
  StockUpdateResult,
  PollResult,
  OrderEvent,
  OfferEvent,
  OAuthTokens,
  MarketplacePlatform,
} from "../types/marketplace.js";
import { env } from "../config/env.js";

// ─────────────────────────────────────────────────────────────────────────────
// Amazon-specific response shapes
// ─────────────────────────────────────────────────────────────────────────────

interface LwaTokenResponse {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly token_type: string;
  readonly expires_in: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Amazon SP-API connector
// ─────────────────────────────────────────────────────────────────────────────

export class AmazonConnector extends BaseConnector {
  readonly platform: MarketplacePlatform = "amazon";

  readonly capabilities: ConnectorCapabilities = {
    hasWebhooks: true,
    hasBulkApi: true,
    hasMessaging: true,
    hasRefunds: true,
    hasDisputes: true,
    // Amazon Feeds API can handle large batches via XML/JSON feed documents
    maxBatchSize: 500,
    supportsImages: true,
    requiresEAN: true,
  };

  /** Amazon SP-API base URL for EU region */
  private static readonly SP_API_BASE = "https://sellingpartnerapi-eu.amazon.com";
  /** LWA token endpoint */
  private static readonly LWA_TOKEN_URL =
    "https://api.amazon.com/auth/o2/token";

  constructor(logger: Logger) {
    super(
      logger,
      // Amazon: 0.5 req/sec per operation — conservative capacity
      { capacity: 10, refillRatePerSec: 0.5 },
    );
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      application_id: env.AMAZON_LWA_CLIENT_ID ?? "",
      state,
      version: "beta",
    });
    return `https://sellercentral.amazon.pl/apps/authorize/consent?${params.toString()}`;
  }

  async exchangeCode(code: string, _state: string): Promise<OAuthTokens> {
    if (
      env.AMAZON_LWA_CLIENT_ID === undefined ||
      env.AMAZON_LWA_CLIENT_SECRET === undefined
    ) {
      throw new ConnectorError(
        "UNAUTHORIZED",
        "Amazon LWA credentials not configured",
        "amazon",
        false,
      );
    }

    return this.callApiWithRetry(async () => {
      const response = await fetch(AmazonConnector.LWA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: env.AMAZON_LWA_CLIENT_ID ?? "",
          client_secret: env.AMAZON_LWA_CLIENT_SECRET ?? "",
        }).toString(),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new ConnectorError(
          "UNAUTHORIZED",
          `Amazon LWA code exchange failed: ${response.status} ${body}`,
          "amazon",
          false,
        );
      }

      const data = (await response.json()) as LwaTokenResponse;
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + (data.expires_in - 60) * 1000),
        platformUserId: "amazon-seller",
      };
    });
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    if (
      env.AMAZON_LWA_CLIENT_ID === undefined ||
      env.AMAZON_LWA_CLIENT_SECRET === undefined
    ) {
      throw new ConnectorError(
        "UNAUTHORIZED",
        "Amazon LWA credentials not configured",
        "amazon",
        false,
      );
    }

    return this.callApiWithRetry(async () => {
      const response = await fetch(AmazonConnector.LWA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: env.AMAZON_LWA_CLIENT_ID ?? "",
          client_secret: env.AMAZON_LWA_CLIENT_SECRET ?? "",
        }).toString(),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new ConnectorError(
          "TOKEN_EXPIRED",
          `Amazon LWA token refresh failed: ${response.status} ${body}`,
          "amazon",
          false,
        );
      }

      const data = (await response.json()) as LwaTokenResponse;
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + (data.expires_in - 60) * 1000),
        platformUserId: "amazon-seller",
      };
    });
  }

  // ── Offers (Phase 2 — stub) ───────────────────────────────────────────────
  //
  // Amazon SP-API listing creation involves:
  // 1. PUT /listings/2021-08-01/items/{sellerId}/{sku}
  // 2. Requires category-specific attributes schema from:
  //    GET /definitions/2020-09-01/productTypes/{productType}
  //
  // Full implementation requires AWS Signature V4 signing.

  async createOffer(
    _product: CanonicalProduct,
    _auth: ConnectorAuthContext,
  ): Promise<ConnectorOfferResult> {
    this.logUnimplemented("createOffer");
    throw new ConnectorError(
      "PLATFORM_ERROR",
      "Amazon createOffer not yet implemented (Phase 2)",
      "amazon",
      false,
    );
  }

  async updateOffer(
    _externalOfferId: string,
    _product: Partial<CanonicalProduct>,
    _auth: ConnectorAuthContext,
  ): Promise<ConnectorOfferResult> {
    this.logUnimplemented("updateOffer");
    throw new ConnectorError(
      "PLATFORM_ERROR",
      "Amazon updateOffer not yet implemented (Phase 2)",
      "amazon",
      false,
    );
  }

  async deactivateOffer(
    _externalOfferId: string,
    _auth: ConnectorAuthContext,
  ): Promise<void> {
    this.logUnimplemented("deactivateOffer");
    throw new ConnectorError(
      "PLATFORM_ERROR",
      "Amazon deactivateOffer not yet implemented (Phase 2)",
      "amazon",
      false,
    );
  }

  async getOffer(
    _externalOfferId: string,
    _auth: ConnectorAuthContext,
  ): Promise<ConnectorOfferResult> {
    this.logUnimplemented("getOffer");
    throw new ConnectorError(
      "PLATFORM_ERROR",
      "Amazon getOffer not yet implemented (Phase 2)",
      "amazon",
      false,
    );
  }

  async listOffers(
    _auth: ConnectorAuthContext,
    _cursor?: string,
    _limit?: number,
  ): Promise<PollResult<ConnectorOfferResult>> {
    this.logUnimplemented("listOffers");
    throw new ConnectorError(
      "PLATFORM_ERROR",
      "Amazon listOffers not yet implemented (Phase 2)",
      "amazon",
      false,
    );
  }

  // ── Orders (Phase 2 — stub) ───────────────────────────────────────────────
  //
  // Amazon SP-API orders:
  // GET /orders/v0/orders?MarketplaceIds=A1C3SOZRARQ6R3&CreatedAfter=...
  //
  // Order events arrive via SQS (webhook) — subscribe via
  // POST /notifications/v1/subscriptions/ORDER_CHANGE

  async getOrders(
    _auth: ConnectorAuthContext,
    _since: Date,
    _cursor?: string,
  ): Promise<PollResult<CanonicalOrder>> {
    this.logUnimplemented("getOrders");
    throw new ConnectorError(
      "PLATFORM_ERROR",
      "Amazon getOrders not yet implemented (Phase 2)",
      "amazon",
      false,
    );
  }

  async getOrder(
    _marketplaceOrderId: string,
    _auth: ConnectorAuthContext,
  ): Promise<CanonicalOrder> {
    this.logUnimplemented("getOrder");
    throw new ConnectorError(
      "PLATFORM_ERROR",
      "Amazon getOrder not yet implemented (Phase 2)",
      "amazon",
      false,
    );
  }

  async updateOrderStatus(
    _marketplaceOrderId: string,
    _status: CanonicalOrderStatus,
    _auth: ConnectorAuthContext,
  ): Promise<void> {
    this.logUnimplemented("updateOrderStatus");
    throw new ConnectorError(
      "PLATFORM_ERROR",
      "Amazon updateOrderStatus not yet implemented (Phase 2)",
      "amazon",
      false,
    );
  }

  async addTrackingNumber(
    _marketplaceOrderId: string,
    _trackingNumber: string,
    _carrier: string,
    _auth: ConnectorAuthContext,
  ): Promise<void> {
    this.logUnimplemented("addTrackingNumber");
    throw new ConnectorError(
      "PLATFORM_ERROR",
      "Amazon addTrackingNumber not yet implemented (Phase 2)",
      "amazon",
      false,
    );
  }

  async updateStock(
    update: StockUpdate,
    _auth: ConnectorAuthContext,
  ): Promise<StockUpdateResult> {
    this.logUnimplemented("updateStock");
    return {
      sku: update.sku,
      platform: "amazon",
      success: false,
      error: "Amazon updateStock not yet implemented (Phase 2)",
      updatedAt: new Date(),
    };
  }

  async batchUpdateStock(
    updates: readonly StockUpdate[],
    _auth: ConnectorAuthContext,
  ): Promise<readonly StockUpdateResult[]> {
    this.logUnimplemented("batchUpdateStock");
    return updates.map((u) => ({
      sku: u.sku,
      platform: "amazon" as const,
      success: false,
      error: "Amazon batchUpdateStock not yet implemented (Phase 2)",
      updatedAt: new Date(),
    }));
  }

  // ── Event polling — Amazon uses webhooks (SQS), not polling ─────────────

  async pollOrderEvents(
    _auth: ConnectorAuthContext,
    _lastEventId?: string,
  ): Promise<PollResult<OrderEvent>> {
    // Amazon uses SQS webhooks — polling not applicable
    this.logger.debug(
      { platform: "amazon" },
      "Amazon uses SQS webhooks — pollOrderEvents is a no-op",
    );
    return { events: [], nextCursor: null };
  }

  async pollOfferEvents(
    _auth: ConnectorAuthContext,
    _lastEventId?: string,
  ): Promise<PollResult<OfferEvent>> {
    this.logger.debug(
      { platform: "amazon" },
      "Amazon uses SQS webhooks — pollOfferEvents is a no-op",
    );
    return { events: [], nextCursor: null };
  }

  // ── SP-API helper — would sign with AWS Signature V4 in Phase 2 ──────────

  /**
   * Build a signed SP-API request.
   * Phase 2: integrate @aws-sdk/signature-v4 for request signing.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private buildSpApiRequest(
    method: string,
    path: string,
    _accessToken: string,
    _body?: unknown,
  ): Request {
    const requestInit: RequestInit = {
      method,
      headers: {
        "x-amz-access-token": _accessToken,
        "x-amz-date": new Date().toISOString(),
        "Content-Type": "application/json",
        // Phase 2: add Authorization header with AWS Signature V4
        // "Authorization": signRequest(...)
      },
    };

    if (_body !== undefined) {
      requestInit.body = JSON.stringify(_body);
    }

    return new Request(`${AmazonConnector.SP_API_BASE}${path}`, requestInit);
  }

  private logUnimplemented(method: string): void {
    this.logger.warn(
      { platform: "amazon", method },
      "Amazon SP-API method not yet implemented — Phase 2 deliverable",
    );
  }

  /** Expose the marketplace ID for use in webhook subscription setup */
  get marketplaceId(): string {
    return env.AMAZON_MARKETPLACE_ID;
  }

  /** Expose the SP-API base URL for external use */
  get spApiBaseUrl(): string {
    return AmazonConnector.SP_API_BASE;
  }
}
