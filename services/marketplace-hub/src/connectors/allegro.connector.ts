// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — marketplace-hub: Allegro REST API connector
//
// Allegro specifics:
//  • OAuth2 Authorization Code flow, 12h token TTL
//  • NO webhooks — polling via /order/events and /order/checkout-forms
//  • All requests require: Accept: application/vnd.allegro.public.v1+json
//  • Rate limit: 9000 req/min → 150 req/sec → token bucket capacity 150
//  • Batch stock/price via Command Pattern:
//      PUT /sale/offer-price-change-commands/{commandId}
//      PUT /sale/offer-stock-change-commands/{commandId}
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
  BuyerPii,
  ShippingAddress,
  OrderItem,
  OrderPayment,
  OrderShipping,
} from "../types/marketplace.js";
import { asSku, asOrderId } from "../types/marketplace.js";
import { env } from "../config/env.js";
import { encrypt } from "@ecompilot/shared-security";

// ─────────────────────────────────────────────────────────────────────────────
// Allegro-specific response types (raw API shapes)
// ─────────────────────────────────────────────────────────────────────────────

interface AllegroTokenResponse {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_in: number;
  readonly token_type: string;
  readonly scope: string;
  readonly allegro_api: boolean;
}

interface AllegroCheckoutForm {
  readonly id: string;
  readonly status: string;
  readonly buyer: {
    readonly id: string;
    readonly email: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly phoneNumber: string | null;
    readonly address: {
      readonly street: string;
      readonly city: string;
      readonly zipCode: string;
      readonly countryCode: string;
    } | null;
    readonly company: boolean;
    readonly login: string;
  };
  readonly payment: {
    readonly id: string | null;
    readonly type: string;
    readonly provider: string | null;
    readonly finishedAt: string | null;
    readonly paidAmount: { readonly amount: string; readonly currency: string } | null;
  };
  readonly delivery: {
    readonly method: {
      readonly id: string;
      readonly name: string;
    };
    readonly address: {
      readonly firstName: string;
      readonly lastName: string;
      readonly street: string;
      readonly city: string;
      readonly zipCode: string;
      readonly countryCode: string;
    } | null;
    readonly trackingNumber: string | null;
    readonly shipmentSummary: {
      readonly lineItemsSent: string;
    };
  };
  readonly lineItems: ReadonlyArray<{
    readonly id: string;
    readonly quantity: number;
    readonly price: { readonly amount: string; readonly currency: string };
    readonly originalPrice: { readonly amount: string; readonly currency: string };
    readonly offer: {
      readonly id: string;
      readonly name: string;
      readonly external: { readonly id: string | null } | null;
    };
  }>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly boughtAt: string | null;
}

interface AllegroCheckoutFormsResponse {
  readonly checkoutForms: readonly AllegroCheckoutForm[];
  readonly count: number;
  readonly totalCount: number;
}

interface AllegroOrderEvent {
  readonly id: string;
  readonly type: string;
  readonly order: { readonly id: string };
  readonly occurredAt: string;
}

interface AllegroOrderEventsResponse {
  readonly events: readonly AllegroOrderEvent[];
}

interface AllegroOfferResponse {
  readonly id: string;
  readonly status: string;
  readonly publication: {
    readonly status: string;
    readonly startingAt: string | null;
    readonly endingAt: string | null;
  };
  readonly name: string;
  readonly sellingMode: {
    readonly format: string;
    readonly price: { readonly amount: string; readonly currency: string };
  };
  readonly stock: { readonly available: number; readonly unit: string };
}

interface AllegroOffersListResponse {
  readonly offers: readonly AllegroOfferResponse[];
  readonly totalCount: number;
  readonly count: number;
}

interface AllegroCommandTaskReport {
  readonly commandId: string;
  readonly taskCount: number;
  readonly taskReports: ReadonlyArray<{
    readonly taskId: string;
    readonly status: string;
    readonly errors: ReadonlyArray<{ readonly message: string }>;
    readonly offer: { readonly id: string };
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Allegro connector implementation
// ─────────────────────────────────────────────────────────────────────────────

export class AllegroConnector extends BaseConnector {
  readonly platform: MarketplacePlatform = "allegro";

  readonly capabilities: ConnectorCapabilities = {
    hasWebhooks: false,
    hasBulkApi: true,
    hasMessaging: true,
    hasRefunds: false,
    hasDisputes: false,
    maxBatchSize: 1000,
    supportsImages: true,
    requiresEAN: false,
  };

  /** Allegro accept header required on all requests */
  private static readonly ACCEPT_HEADER =
    "application/vnd.allegro.public.v1+json";

  constructor(logger: Logger) {
    super(
      logger,
      // Allegro: 9000 req/min = 150 req/sec
      { capacity: 150, refillRatePerSec: 150 },
    );
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: env.ALLEGRO_CLIENT_ID,
      redirect_uri: env.ALLEGRO_REDIRECT_URI,
      state,
      // Request necessary scopes for order management + offer management
      scope: [
        "allegro:api:sale:offers:write",
        "allegro:api:sale:offers:read",
        "allegro:api:orders:read",
        "allegro:api:orders:write",
        "allegro:api:profile:read",
      ].join(" "),
    });
    return `${env.ALLEGRO_OAUTH_URL}/auth/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string, _state: string): Promise<OAuthTokens> {
    return this.callApiWithRetry(async () => {
      const response = await fetch(
        `${env.ALLEGRO_OAUTH_URL}/auth/oauth/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${this.buildBasicAuth()}`,
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: env.ALLEGRO_REDIRECT_URI,
          }).toString(),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        throw new ConnectorError(
          "UNAUTHORIZED",
          `Allegro token exchange failed: ${response.status} ${body}`,
          "allegro",
          false,
        );
      }

      const data = (await response.json()) as AllegroTokenResponse;
      return this.mapTokenResponse(data);
    });
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    return this.callApiWithRetry(async () => {
      const response = await fetch(
        `${env.ALLEGRO_OAUTH_URL}/auth/oauth/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${this.buildBasicAuth()}`,
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            redirect_uri: env.ALLEGRO_REDIRECT_URI,
          }).toString(),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        throw new ConnectorError(
          "TOKEN_EXPIRED",
          `Allegro token refresh failed: ${response.status} ${body}`,
          "allegro",
          false,
        );
      }

      const data = (await response.json()) as AllegroTokenResponse;
      return this.mapTokenResponse(data);
    });
  }

  // ── Offers ────────────────────────────────────────────────────────────────

  async createOffer(
    product: CanonicalProduct,
    auth: ConnectorAuthContext,
  ): Promise<ConnectorOfferResult> {
    return this.callApiWithRetry(async () => {
      const allegroCategory =
        product.category.mappings["allegro"] ?? "6";

      const body = {
        name: product.title["pl"] ?? product.title["en"] ?? "Brak nazwy",
        category: { id: allegroCategory },
        parameters: product.attributes.map((a) => ({
          id: a.name,
          values: [a.value],
          valuesIds: [],
          rangeValue: null,
        })),
        ean: product.ean ?? undefined,
        description: {
          sections: [
            {
              items: [
                {
                  type: "TEXT",
                  content: `<p>${product.description["pl"] ?? product.description["en"] ?? ""}</p>`,
                },
              ],
            },
          ],
        },
        images: product.images.map((img) => ({ url: img.url })),
        sellingMode: {
          format: "BUY_NOW",
          price: {
            amount: (product.priceGrosze / 100).toFixed(2),
            currency: "PLN",
          },
        },
        stock: {
          available: product.stock,
          unit: "UNIT",
        },
        condition: this.mapCondition(product.condition),
        delivery: {
          shippingRates: product.shippingProfiles[0]
            ? { id: product.shippingProfiles[0].profileId }
            : undefined,
        },
        publication: {
          action: "ACTIVATE",
        },
      };

      const response = await fetch(
        `${env.ALLEGRO_API_URL}/sale/product-offers`,
        {
          method: "POST",
          headers: this.buildAuthHeaders(auth.accessToken),
          body: JSON.stringify(body),
        },
      );

      await this.assertOk(response, "createOffer");

      const data = (await response.json()) as AllegroOfferResponse;
      return this.mapOfferResponse(data);
    });
  }

  async updateOffer(
    externalOfferId: string,
    product: Partial<CanonicalProduct>,
    auth: ConnectorAuthContext,
  ): Promise<ConnectorOfferResult> {
    return this.callApiWithRetry(async () => {
      const patch: Record<string, unknown> = {};

      if (product.title !== undefined) {
        patch["name"] = product.title["pl"] ?? product.title["en"];
      }
      if (product.priceGrosze !== undefined) {
        patch["sellingMode"] = {
          price: {
            amount: (product.priceGrosze / 100).toFixed(2),
            currency: "PLN",
          },
        };
      }
      if (product.stock !== undefined) {
        patch["stock"] = { available: product.stock, unit: "UNIT" };
      }
      if (product.description !== undefined) {
        patch["description"] = {
          sections: [
            {
              items: [
                {
                  type: "TEXT",
                  content: `<p>${product.description["pl"] ?? product.description["en"] ?? ""}</p>`,
                },
              ],
            },
          ],
        };
      }

      const response = await fetch(
        `${env.ALLEGRO_API_URL}/sale/product-offers/${externalOfferId}`,
        {
          method: "PATCH",
          headers: this.buildAuthHeaders(auth.accessToken),
          body: JSON.stringify(patch),
        },
      );

      await this.assertOk(response, "updateOffer");
      const data = (await response.json()) as AllegroOfferResponse;
      return this.mapOfferResponse(data);
    });
  }

  async deactivateOffer(
    externalOfferId: string,
    auth: ConnectorAuthContext,
  ): Promise<void> {
    await this.callApiWithRetry(async () => {
      const response = await fetch(
        `${env.ALLEGRO_API_URL}/sale/product-offers/${externalOfferId}`,
        {
          method: "PATCH",
          headers: this.buildAuthHeaders(auth.accessToken),
          body: JSON.stringify({ publication: { action: "END" } }),
        },
      );
      await this.assertOk(response, "deactivateOffer");
    });
  }

  async getOffer(
    externalOfferId: string,
    auth: ConnectorAuthContext,
  ): Promise<ConnectorOfferResult> {
    return this.callApiWithRetry(async () => {
      const response = await fetch(
        `${env.ALLEGRO_API_URL}/sale/product-offers/${externalOfferId}`,
        {
          method: "GET",
          headers: this.buildAuthHeaders(auth.accessToken),
        },
      );
      await this.assertOk(response, "getOffer");
      const data = (await response.json()) as AllegroOfferResponse;
      return this.mapOfferResponse(data);
    });
  }

  async listOffers(
    auth: ConnectorAuthContext,
    cursor?: string,
    limit = 100,
  ): Promise<PollResult<ConnectorOfferResult>> {
    return this.callApiWithRetry(async () => {
      const params = new URLSearchParams({
        limit: String(Math.min(limit, 1000)),
      });
      if (cursor !== undefined) {
        params.set("offset", cursor);
      }

      const response = await fetch(
        `${env.ALLEGRO_API_URL}/sale/offers?${params.toString()}`,
        {
          method: "GET",
          headers: this.buildAuthHeaders(auth.accessToken),
        },
      );

      await this.assertOk(response, "listOffers");
      const data = (await response.json()) as AllegroOffersListResponse;

      const currentOffset = cursor !== undefined ? Number(cursor) : 0;
      const nextOffset = currentOffset + data.count;
      const hasMore = nextOffset < data.totalCount;

      return {
        events: data.offers.map((o) => this.mapOfferResponse(o)),
        nextCursor: hasMore ? String(nextOffset) : null,
      };
    });
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async getOrders(
    auth: ConnectorAuthContext,
    since: Date,
    cursor?: string,
  ): Promise<PollResult<CanonicalOrder>> {
    return this.callApiWithRetry(async () => {
      const params = new URLSearchParams({
        limit: "100",
        "lineItems.boughtAt.gte": since.toISOString(),
        sort: "-boughtAt",
      });
      if (cursor !== undefined) {
        params.set("offset", cursor);
      }

      const response = await fetch(
        `${env.ALLEGRO_API_URL}/order/checkout-forms?${params.toString()}`,
        {
          method: "GET",
          headers: this.buildAuthHeaders(auth.accessToken),
        },
      );

      await this.assertOk(response, "getOrders");
      const data = (await response.json()) as AllegroCheckoutFormsResponse;

      const currentOffset = cursor !== undefined ? Number(cursor) : 0;
      const nextOffset = currentOffset + data.count;
      const hasMore = nextOffset < data.totalCount;

      return {
        events: data.checkoutForms.map((cf) => this.mapCheckoutForm(cf)),
        nextCursor: hasMore ? String(nextOffset) : null,
      };
    });
  }

  async getOrder(
    marketplaceOrderId: string,
    auth: ConnectorAuthContext,
  ): Promise<CanonicalOrder> {
    return this.callApiWithRetry(async () => {
      const response = await fetch(
        `${env.ALLEGRO_API_URL}/order/checkout-forms/${marketplaceOrderId}`,
        {
          method: "GET",
          headers: this.buildAuthHeaders(auth.accessToken),
        },
      );
      await this.assertOk(response, "getOrder");
      const data = (await response.json()) as AllegroCheckoutForm;
      return this.mapCheckoutForm(data);
    });
  }

  async updateOrderStatus(
    marketplaceOrderId: string,
    status: CanonicalOrderStatus,
    auth: ConnectorAuthContext,
  ): Promise<void> {
    const allegroStatus = this.mapOrderStatusToAllegro(status);
    if (allegroStatus === null) {
      // Allegro doesn't support all canonical statuses directly
      return;
    }

    await this.callApiWithRetry(async () => {
      const response = await fetch(
        `${env.ALLEGRO_API_URL}/order/checkout-forms/${marketplaceOrderId}/fulfillment`,
        {
          method: "PUT",
          headers: this.buildAuthHeaders(auth.accessToken),
          body: JSON.stringify({ status: allegroStatus }),
        },
      );
      await this.assertOk(response, "updateOrderStatus");
    });
  }

  async addTrackingNumber(
    marketplaceOrderId: string,
    trackingNumber: string,
    carrier: string,
    auth: ConnectorAuthContext,
  ): Promise<void> {
    await this.callApiWithRetry(async () => {
      // Allegro uses shipment endpoints — create a shipment
      const response = await fetch(
        `${env.ALLEGRO_API_URL}/order/checkout-forms/${marketplaceOrderId}/shipments`,
        {
          method: "POST",
          headers: this.buildAuthHeaders(auth.accessToken),
          body: JSON.stringify({
            waybill: trackingNumber,
            carrierId: this.mapCarrierToAllegro(carrier),
            carriersName: carrier,
            lineItems: [], // empty = all items
          }),
        },
      );
      await this.assertOk(response, "addTrackingNumber");
    });
  }

  // ── Stock (single) ────────────────────────────────────────────────────────

  async updateStock(
    update: StockUpdate,
    auth: ConnectorAuthContext,
  ): Promise<StockUpdateResult> {
    if (update.externalOfferId === undefined) {
      return {
        sku: update.sku,
        platform: "allegro",
        success: false,
        error: "externalOfferId is required for Allegro stock update",
        updatedAt: new Date(),
      };
    }

    try {
      await this.callApiWithRetry(async () => {
        const response = await fetch(
          `${env.ALLEGRO_API_URL}/sale/product-offers/${update.externalOfferId}`,
          {
            method: "PATCH",
            headers: this.buildAuthHeaders(auth.accessToken),
            body: JSON.stringify({
              stock: { available: update.newQuantity, unit: "UNIT" },
            }),
          },
        );
        await this.assertOk(response, "updateStock");
      });

      return {
        sku: update.sku,
        platform: "allegro",
        success: true,
        error: undefined,
        updatedAt: new Date(),
      };
    } catch (err) {
      const message =
        err instanceof ConnectorError
          ? err.message
          : "Unknown error updating stock";
      return {
        sku: update.sku,
        platform: "allegro",
        success: false,
        error: message,
        updatedAt: new Date(),
      };
    }
  }

  // ── Stock (batch via Command Pattern) ─────────────────────────────────────

  async batchUpdateStock(
    updates: readonly StockUpdate[],
    auth: ConnectorAuthContext,
  ): Promise<readonly StockUpdateResult[]> {
    if (updates.length === 0) return [];

    const validUpdates = updates.filter((u) => u.externalOfferId !== undefined);
    const invalidUpdates = updates.filter((u) => u.externalOfferId === undefined);

    const invalidResults: StockUpdateResult[] = invalidUpdates.map((u) => ({
      sku: u.sku,
      platform: "allegro" as const,
      success: false,
      error: "externalOfferId is required for Allegro stock batch update",
      updatedAt: new Date(),
    }));

    if (validUpdates.length === 0) return invalidResults;

    // Chunk into maxBatchSize (1000)
    const chunks = this.chunk(validUpdates, this.capabilities.maxBatchSize);
    const allResults: StockUpdateResult[] = [...invalidResults];

    for (const chunk of chunks) {
      const commandId = crypto.randomUUID();
      const results = await this.executeStockChangeCommand(
        commandId,
        chunk,
        auth,
      );
      allResults.push(...results);
    }

    return allResults;
  }

  // ── Event polling (Allegro uses event feed, not webhooks) ────────────────

  async pollOrderEvents(
    auth: ConnectorAuthContext,
    lastEventId?: string,
  ): Promise<PollResult<OrderEvent>> {
    return this.callApiWithRetry(async () => {
      const params = new URLSearchParams({ limit: "500" });
      if (lastEventId !== undefined) {
        params.set("from", lastEventId);
      }

      const response = await fetch(
        `${env.ALLEGRO_API_URL}/order/events?${params.toString()}`,
        {
          method: "GET",
          headers: this.buildAuthHeaders(auth.accessToken),
        },
      );

      await this.assertOk(response, "pollOrderEvents");
      const data = (await response.json()) as AllegroOrderEventsResponse;

      const events: OrderEvent[] = data.events.map((ev) => ({
        eventId: ev.id,
        type: this.mapAllegroEventType(ev.type),
        orderId: ev.order.id,
        occurredAt: new Date(ev.occurredAt),
        payload: ev as unknown as Record<string, unknown>,
      }));

      const lastId = data.events[data.events.length - 1]?.id ?? null;

      return {
        events,
        nextCursor: lastId,
      };
    });
  }

  async pollOfferEvents(
    auth: ConnectorAuthContext,
    lastEventId?: string,
  ): Promise<PollResult<OfferEvent>> {
    return this.callApiWithRetry(async () => {
      const params = new URLSearchParams({ limit: "500" });
      if (lastEventId !== undefined) {
        params.set("from", lastEventId);
      }

      const response = await fetch(
        `${env.ALLEGRO_API_URL}/sale/offer-events?${params.toString()}`,
        {
          method: "GET",
          headers: this.buildAuthHeaders(auth.accessToken),
        },
      );

      await this.assertOk(response, "pollOfferEvents");

      // Allegro offer events response shape
      const data = (await response.json()) as {
        events: ReadonlyArray<{
          id: string;
          type: string;
          offer: { id: string };
          occurredAt: string;
        }>;
      };

      const events: OfferEvent[] = data.events.map((ev) => ({
        eventId: ev.id,
        type: this.mapAllegroOfferEventType(ev.type),
        offerId: ev.offer.id,
        occurredAt: new Date(ev.occurredAt),
        payload: ev as unknown as Record<string, unknown>,
      }));

      const lastId = data.events[data.events.length - 1]?.id ?? null;

      return {
        events,
        nextCursor: lastId,
      };
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private buildBasicAuth(): string {
    return Buffer.from(
      `${env.ALLEGRO_CLIENT_ID}:${env.ALLEGRO_CLIENT_SECRET}`,
    ).toString("base64");
  }

  private buildAuthHeaders(
    accessToken: string,
  ): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: AllegroConnector.ACCEPT_HEADER,
      "Content-Type": "application/vnd.allegro.public.v1+json",
    };
  }

  private async assertOk(response: Response, operation: string): Promise<void> {
    if (response.ok) return;

    const body = await response.text().catch(() => "(unreadable)");

    if (response.status === 401 || response.status === 403) {
      throw new ConnectorError(
        response.status === 401 ? "UNAUTHORIZED" : "UNAUTHORIZED",
        `Allegro ${operation}: ${response.status} ${body}`,
        "allegro",
        false,
      );
    }

    if (response.status === 404) {
      throw new ConnectorError(
        "NOT_FOUND",
        `Allegro ${operation}: resource not found`,
        "allegro",
        false,
      );
    }

    if (response.status === 422) {
      throw new ConnectorError(
        "VALIDATION_ERROR",
        `Allegro ${operation}: validation failed — ${body}`,
        "allegro",
        false,
      );
    }

    if (response.status === 429) {
      throw new ConnectorError(
        "RATE_LIMITED",
        `Allegro ${operation}: rate limit exceeded`,
        "allegro",
        true,
      );
    }

    // 5xx — retryable
    throw new ConnectorError(
      "PLATFORM_ERROR",
      `Allegro ${operation}: ${response.status} ${body}`,
      "allegro",
      response.status >= 500,
    );
  }

  private mapTokenResponse(data: AllegroTokenResponse): OAuthTokens {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      // Allegro 12h TTL — subtract 60s buffer
      expiresAt: new Date(
        Date.now() + (data.expires_in - 60) * 1000,
      ),
      // Allegro doesn't return a user ID at token exchange — use sub from JWT
      platformUserId: this.extractSubFromJwt(data.access_token),
    };
  }

  private extractSubFromJwt(token: string): string {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return "unknown";
      const payload = JSON.parse(
        Buffer.from(parts[1] ?? "", "base64url").toString("utf8"),
      ) as { sub?: string };
      return payload.sub ?? "unknown";
    } catch {
      return "unknown";
    }
  }

  private mapOfferResponse(data: AllegroOfferResponse): ConnectorOfferResult {
    const pubStatus = data.publication?.status ?? data.status;
    return {
      externalOfferId: data.id,
      platform: "allegro",
      status: this.mapAllegroOfferStatus(pubStatus),
      url: `https://allegro.pl/oferta/${data.id}`,
      publishedAt:
        data.publication?.startingAt !== undefined && data.publication.startingAt !== null
          ? new Date(data.publication.startingAt)
          : null,
    };
  }

  private mapAllegroOfferStatus(
    status: string,
  ): ConnectorOfferResult["status"] {
    switch (status.toUpperCase()) {
      case "ACTIVE":
        return "active";
      case "INACTIVE":
      case "ENDED":
        return "inactive";
      case "ACTIVATING":
      case "WAITING":
        return "pending";
      case "BLOCKED":
      case "REFUSED":
        return "rejected";
      default:
        return "pending";
    }
  }

  private mapCheckoutForm(cf: AllegroCheckoutForm): CanonicalOrder {
    const buyerFullName =
      `${cf.buyer.firstName} ${cf.buyer.lastName}`.trim();

    const buyer: BuyerPii = {
      encryptedName: encrypt(buyerFullName, env.ENCRYPTION_KEY),
      encryptedEmail: encrypt(cf.buyer.email, env.ENCRYPTION_KEY),
      encryptedPhone: cf.buyer.phoneNumber !== null
        ? encrypt(cf.buyer.phoneNumber, env.ENCRYPTION_KEY)
        : null,
    };

    const deliveryAddr = cf.delivery.address ?? cf.buyer.address;
    const shippingAddress: ShippingAddress = {
      city: deliveryAddr?.city ?? "",
      postalCode: deliveryAddr?.zipCode ?? "",
      countryCode: deliveryAddr?.countryCode ?? "PL",
      encryptedStreet: deliveryAddr?.street !== undefined
        ? encrypt(deliveryAddr.street, env.ENCRYPTION_KEY)
        : encrypt("", env.ENCRYPTION_KEY),
    };

    const items: OrderItem[] = cf.lineItems.map((li) => {
      const unitPriceGrosze = Math.round(
        parseFloat(li.price.amount) * 100,
      );
      return {
        sku: asSku(li.offer.external?.id ?? li.offer.id),
        externalOfferId: li.offer.id,
        name: li.offer.name,
        quantity: li.quantity,
        unitPriceGrosze,
        totalPriceGrosze: unitPriceGrosze * li.quantity,
      };
    });

    const totalGrosze = items.reduce(
      (sum, item) => sum + item.totalPriceGrosze,
      0,
    );

    const payment: OrderPayment = {
      method: cf.payment.type,
      status: cf.payment.finishedAt !== null ? "paid" : "pending",
      paidGrosze:
        cf.payment.paidAmount !== null
          ? Math.round(parseFloat(cf.payment.paidAmount.amount) * 100)
          : totalGrosze,
      paidAt:
        cf.payment.finishedAt !== null
          ? new Date(cf.payment.finishedAt)
          : null,
      externalPaymentId: cf.payment.id,
    };

    const shipping: OrderShipping = {
      carrier: cf.delivery.method.name,
      trackingNumber: cf.delivery.trackingNumber,
      shippedAt: null,
      estimatedDeliveryAt: null,
      shippingAddress,
    };

    return {
      id: cf.id,
      marketplaceOrderId: cf.id,
      platform: "allegro",
      status: this.mapAllegroOrderStatus(cf.status),
      buyer,
      items,
      shipping,
      payment,
      timestamps: {
        createdAt: new Date(cf.createdAt),
        updatedAt: new Date(cf.updatedAt),
        confirmedAt: cf.boughtAt !== null ? new Date(cf.boughtAt) : null,
        shippedAt: null,
        deliveredAt: null,
        cancelledAt: null,
      },
    };
  }

  private mapAllegroOrderStatus(status: string): CanonicalOrderStatus {
    switch (status.toUpperCase()) {
      case "BOUGHT":
      case "FILLED_IN":
        return "confirmed";
      case "READY_FOR_PROCESSING":
        return "processing";
      case "CANCELLED":
        return "cancelled";
      default:
        return "pending";
    }
  }

  private mapOrderStatusToAllegro(status: CanonicalOrderStatus): string | null {
    switch (status) {
      case "processing":
        return "READY_FOR_PROCESSING";
      case "shipped":
        return "SENT";
      case "delivered":
        return "PICKED_UP";
      case "cancelled":
        return "CANCELLED";
      default:
        return null;
    }
  }

  private mapCarrierToAllegro(carrier: string): string {
    const map: Record<string, string> = {
      inpost: "INPOST",
      dpd: "DPD",
      dhl: "DHL",
      ups: "UPS",
      gls: "GLS",
      fedex: "FEDEX",
      pocztex: "POCZTA_POLSKA",
      poczta_polska: "POCZTA_POLSKA",
    };
    return map[carrier.toLowerCase()] ?? "OTHER";
  }

  private mapCondition(
    condition: CanonicalProduct["condition"],
  ): string {
    switch (condition) {
      case "new":
        return "NEW";
      case "used_like_new":
        return "USED";
      case "used_good":
        return "USED";
      case "used_acceptable":
        return "USED";
      case "refurbished":
        return "RESTORED";
    }
  }

  private mapAllegroEventType(
    type: string,
  ): OrderEvent["type"] {
    switch (type) {
      case "BOUGHT":
      case "FILLED_IN":
        return "order_created";
      case "CANCELLED":
        return "order_cancelled";
      default:
        return "order_updated";
    }
  }

  private mapAllegroOfferEventType(
    type: string,
  ): OfferEvent["type"] {
    switch (type) {
      case "ACTIVATED":
        return "offer_activated";
      case "SUSPENDED":
        return "offer_suspended";
      case "ENDED":
        return "offer_ended";
      default:
        return "offer_updated";
    }
  }

  /** Execute Allegro batch stock change via the Command Pattern */
  private async executeStockChangeCommand(
    commandId: string,
    updates: readonly StockUpdate[],
    auth: ConnectorAuthContext,
  ): Promise<StockUpdateResult[]> {
    return this.callApiWithRetry(async () => {
      // Submit the command
      const body = {
        modification: {
          changeType: "FIXED",
        },
        offerCriteria: updates.map((u) => ({
          offers: [{ id: u.externalOfferId }],
          type: "CONTAINS_OFFERS",
        })),
        stockAmendments: updates.map((u) => ({
          offer: { id: u.externalOfferId },
          stock: { available: u.newQuantity, unit: "UNIT" },
        })),
      };

      const submitResponse = await fetch(
        `${env.ALLEGRO_API_URL}/sale/offer-stock-change-commands/${commandId}`,
        {
          method: "PUT",
          headers: this.buildAuthHeaders(auth.accessToken),
          body: JSON.stringify(body),
        },
      );

      await this.assertOk(submitResponse, "batchUpdateStock/submit");

      // Poll for completion (commands are async on Allegro)
      const report = await this.pollCommandReport(commandId, auth.accessToken);

      return updates.map((u) => {
        const taskReport = report.taskReports.find(
          (tr) => tr.offer.id === u.externalOfferId,
        );

        if (taskReport === undefined) {
          return {
            sku: u.sku,
            platform: "allegro" as const,
            success: false,
            error: "No task report returned for offer",
            updatedAt: new Date(),
          };
        }

        const failed =
          taskReport.status === "FAIL" || taskReport.errors.length > 0;
        return {
          sku: u.sku,
          platform: "allegro" as const,
          success: !failed,
          error: failed
            ? taskReport.errors.map((e) => e.message).join(", ")
            : undefined,
          updatedAt: new Date(),
        };
      });
    });
  }

  private async pollCommandReport(
    commandId: string,
    accessToken: string,
    maxAttempts = 10,
    intervalMs = 2000,
  ): Promise<AllegroCommandTaskReport> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await fetch(
        `${env.ALLEGRO_API_URL}/sale/offer-stock-change-commands/${commandId}/tasks`,
        {
          method: "GET",
          headers: this.buildAuthHeaders(accessToken),
        },
      );

      await this.assertOk(response, "pollCommandReport");
      const report = (await response.json()) as AllegroCommandTaskReport;

      const allDone = report.taskReports.every(
        (tr) => tr.status === "SUCCESS" || tr.status === "FAIL",
      );

      if (allDone || report.taskCount === report.taskReports.length) {
        return report;
      }

      if (attempt < maxAttempts - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    throw new ConnectorError(
      "PLATFORM_ERROR",
      `Allegro batch command ${commandId} did not complete in time`,
      "allegro",
      true,
    );
  }

  private chunk<T>(arr: readonly T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push([...arr.slice(i, i + size)]);
    }
    return chunks;
  }

  // Allow external callers to get the order ID brand
  makeOrderId = asOrderId;
}
