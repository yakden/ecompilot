// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — marketplace-hub: Core domain types
// Canonical Model + Adapter Pattern over 8 Polish marketplaces
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Branded types for domain safety
// ─────────────────────────────────────────────────────────────────────────────

declare const __brand: unique symbol;
type Brand<T, TBrand extends string> = T & { readonly [__brand]: TBrand };

export type OfferId = Brand<string, "OfferId">;
export type OrderId = Brand<string, "OrderId">;
export type AccountId = Brand<string, "AccountId">;
export type Sku = Brand<string, "Sku">;
export type Ean = Brand<string, "Ean">;

export function asOfferId(id: string): OfferId {
  return id as OfferId;
}

export function asOrderId(id: string): OrderId {
  return id as OrderId;
}

export function asAccountId(id: string): AccountId {
  return id as AccountId;
}

export function asSku(sku: string): Sku {
  return sku as Sku;
}

export function asEan(ean: string): Ean {
  return ean as Ean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform discriminated union
// ─────────────────────────────────────────────────────────────────────────────

export type MarketplacePlatform =
  | "allegro"
  | "amazon"
  | "ebay"
  | "etsy"
  | "olx"
  | "vinted"
  | "empik"
  | "erli";

export const MARKETPLACE_PLATFORMS = [
  "allegro",
  "amazon",
  "ebay",
  "etsy",
  "olx",
  "vinted",
  "empik",
  "erli",
] as const satisfies readonly MarketplacePlatform[];

// ─────────────────────────────────────────────────────────────────────────────
// OAuth token bundle
// ─────────────────────────────────────────────────────────────────────────────

export interface OAuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: Date;
  /** Platform-specific user/account identifier returned at OAuth */
  readonly platformUserId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connector capabilities — declare what each platform can do
// ─────────────────────────────────────────────────────────────────────────────

export interface ConnectorCapabilities {
  /** Platform pushes events via webhooks (otherwise we poll) */
  readonly hasWebhooks: boolean;
  /** Platform supports bulk create/update operations */
  readonly hasBulkApi: boolean;
  /** Platform supports buyer messaging */
  readonly hasMessaging: boolean;
  /** Platform supports refund API */
  readonly hasRefunds: boolean;
  /** Platform has dispute management */
  readonly hasDisputes: boolean;
  /** Maximum items in a single batch request (1 = no batching) */
  readonly maxBatchSize: number;
  /** Images can be uploaded via API */
  readonly supportsImages: boolean;
  /** Platform mandates EAN/GTIN for product listings */
  readonly requiresEAN: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical product model
// ─────────────────────────────────────────────────────────────────────────────

export type I18nString = Partial<Record<"pl" | "en" | "ru" | "ua", string>>;

export interface ProductDimensions {
  readonly lengthCm: number;
  readonly widthCm: number;
  readonly heightCm: number;
}

export interface ProductImage {
  readonly url: string;
  readonly altText: string | undefined;
  /** 0-indexed position */
  readonly position: number;
}

export interface ProductAttribute {
  readonly name: string;
  readonly value: string;
  readonly unit: string | undefined;
}

export interface ShippingProfile {
  readonly profileId: string;
  readonly carrier: string;
  readonly price: number;
  readonly currency: "PLN" | "EUR" | "USD";
  readonly estimatedDaysMin: number;
  readonly estimatedDaysMax: number;
}

/** Category with marketplace-specific ID mappings */
export interface ProductCategory {
  /** Internal EcomPilot category ID */
  readonly id: string;
  readonly name: string;
  /** Platform-specific category IDs keyed by platform */
  readonly mappings: Partial<Record<MarketplacePlatform, string>>;
}

export type ProductCondition = "new" | "used_like_new" | "used_good" | "used_acceptable" | "refurbished";

export interface CanonicalProduct {
  readonly id: string;
  readonly sku: Sku;
  readonly ean: Ean | null;
  readonly title: I18nString;
  readonly description: I18nString;
  /** Price in PLN grosz (integer to avoid floating point) */
  readonly priceGrosze: number;
  readonly stock: number;
  readonly images: readonly ProductImage[];
  readonly attributes: readonly ProductAttribute[];
  readonly category: ProductCategory;
  /** Weight in grams */
  readonly weightGrams: number;
  readonly dimensions: ProductDimensions | null;
  readonly condition: ProductCondition;
  readonly shippingProfiles: readonly ShippingProfile[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical order model
// ─────────────────────────────────────────────────────────────────────────────

export type CanonicalOrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned"
  | "refunded";

/** Encrypted PII — stored as ciphertext, decrypted on demand */
export interface BuyerPii {
  readonly encryptedName: string;
  readonly encryptedEmail: string;
  readonly encryptedPhone: string | null;
}

export interface ShippingAddress {
  /** Non-PII part — city/postal for logistics routing */
  readonly city: string;
  readonly postalCode: string;
  readonly countryCode: string;
  /** Full address — stored encrypted */
  readonly encryptedStreet: string;
}

export interface OrderItem {
  readonly sku: Sku;
  readonly externalOfferId: string;
  readonly name: string;
  readonly quantity: number;
  /** Unit price in grosz (PLN * 100) */
  readonly unitPriceGrosze: number;
  /** Total = unit * qty */
  readonly totalPriceGrosze: number;
}

export interface OrderPayment {
  readonly method: string;
  readonly status: "pending" | "paid" | "failed" | "refunded";
  /** Total paid in grosz */
  readonly paidGrosze: number;
  readonly paidAt: Date | null;
  readonly externalPaymentId: string | null;
}

export interface OrderShipping {
  readonly carrier: string;
  readonly trackingNumber: string | null;
  readonly shippedAt: Date | null;
  readonly estimatedDeliveryAt: Date | null;
  readonly shippingAddress: ShippingAddress;
}

export interface CanonicalOrder {
  readonly id: string;
  readonly marketplaceOrderId: string;
  readonly platform: MarketplacePlatform;
  readonly status: CanonicalOrderStatus;
  /** PII kept encrypted at rest */
  readonly buyer: BuyerPii;
  readonly items: readonly OrderItem[];
  readonly shipping: OrderShipping;
  readonly payment: OrderPayment;
  readonly timestamps: {
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly confirmedAt: Date | null;
    readonly shippedAt: Date | null;
    readonly deliveredAt: Date | null;
    readonly cancelledAt: Date | null;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Offer result returned by connectors
// ─────────────────────────────────────────────────────────────────────────────

export interface ConnectorOfferResult {
  readonly externalOfferId: string;
  readonly platform: MarketplacePlatform;
  readonly status: "active" | "inactive" | "pending" | "rejected";
  readonly url: string | null;
  readonly publishedAt: Date | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock update types
// ─────────────────────────────────────────────────────────────────────────────

export interface StockUpdate {
  readonly sku: Sku;
  readonly newQuantity: number;
  readonly externalOfferId: string | undefined;
}

export interface StockUpdateResult {
  readonly sku: Sku;
  readonly platform: MarketplacePlatform;
  readonly success: boolean;
  readonly error: string | undefined;
  readonly updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event poll types — for polling-only platforms
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderEvent {
  readonly eventId: string;
  readonly type: "order_created" | "order_updated" | "order_cancelled";
  readonly orderId: string;
  readonly occurredAt: Date;
  readonly payload: Record<string, unknown>;
}

export interface OfferEvent {
  readonly eventId: string;
  readonly type: "offer_activated" | "offer_suspended" | "offer_ended" | "offer_updated";
  readonly offerId: string;
  readonly occurredAt: Date;
  readonly payload: Record<string, unknown>;
}

export interface PollResult<T> {
  readonly events: readonly T[];
  /** Opaque cursor / lastEventId to pass on next poll */
  readonly nextCursor: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MarketplaceConnector interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ConnectorAuthContext {
  readonly accountId: AccountId;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenExpiresAt: Date;
}

export interface MarketplaceConnector {
  readonly platform: MarketplacePlatform;
  readonly capabilities: ConnectorCapabilities;

  // ── Auth ─────────────────────────────────────────────────────────────────
  getAuthorizationUrl(state: string): string;
  exchangeCode(code: string, state: string): Promise<OAuthTokens>;
  refreshToken(refreshToken: string): Promise<OAuthTokens>;

  // ── Offers ───────────────────────────────────────────────────────────────
  createOffer(
    product: CanonicalProduct,
    auth: ConnectorAuthContext,
  ): Promise<ConnectorOfferResult>;

  updateOffer(
    externalOfferId: string,
    product: Partial<CanonicalProduct>,
    auth: ConnectorAuthContext,
  ): Promise<ConnectorOfferResult>;

  deactivateOffer(
    externalOfferId: string,
    auth: ConnectorAuthContext,
  ): Promise<void>;

  getOffer(
    externalOfferId: string,
    auth: ConnectorAuthContext,
  ): Promise<ConnectorOfferResult>;

  listOffers(
    auth: ConnectorAuthContext,
    cursor?: string,
    limit?: number,
  ): Promise<PollResult<ConnectorOfferResult>>;

  // ── Orders ───────────────────────────────────────────────────────────────
  getOrders(
    auth: ConnectorAuthContext,
    since: Date,
    cursor?: string,
  ): Promise<PollResult<CanonicalOrder>>;

  getOrder(
    marketplaceOrderId: string,
    auth: ConnectorAuthContext,
  ): Promise<CanonicalOrder>;

  updateOrderStatus(
    marketplaceOrderId: string,
    status: CanonicalOrderStatus,
    auth: ConnectorAuthContext,
  ): Promise<void>;

  addTrackingNumber(
    marketplaceOrderId: string,
    trackingNumber: string,
    carrier: string,
    auth: ConnectorAuthContext,
  ): Promise<void>;

  // ── Stock ────────────────────────────────────────────────────────────────
  updateStock(
    update: StockUpdate,
    auth: ConnectorAuthContext,
  ): Promise<StockUpdateResult>;

  batchUpdateStock(
    updates: readonly StockUpdate[],
    auth: ConnectorAuthContext,
  ): Promise<readonly StockUpdateResult[]>;

  // ── Event polling (polling-only platforms) ───────────────────────────────
  pollOrderEvents(
    auth: ConnectorAuthContext,
    lastEventId?: string,
  ): Promise<PollResult<OrderEvent>>;

  pollOfferEvents(
    auth: ConnectorAuthContext,
    lastEventId?: string,
  ): Promise<PollResult<OfferEvent>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiter interface (implemented in base connector)
// ─────────────────────────────────────────────────────────────────────────────

export interface RateLimiterConfig {
  /** Max tokens (requests) in the bucket */
  readonly capacity: number;
  /** Tokens refilled per second */
  readonly refillRatePerSec: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Circuit breaker states (discriminated union)
// ─────────────────────────────────────────────────────────────────────────────

export type CircuitBreakerState =
  | { readonly status: "CLOSED"; readonly failures: number; readonly successes: number }
  | { readonly status: "OPEN"; readonly openedAt: Date; readonly failures: number }
  | { readonly status: "HALF_OPEN"; readonly probeSuccesses: number };

export interface CircuitBreakerConfig {
  /** Percentage threshold (0-100) at which circuit opens */
  readonly failureThresholdPct: number;
  /** Rolling window in milliseconds */
  readonly windowMs: number;
  /** Time before transitioning OPEN -> HALF_OPEN */
  readonly waitDurationMs: number;
  /** Successful probes required to close from HALF_OPEN */
  readonly successThreshold: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connector error types
// ─────────────────────────────────────────────────────────────────────────────

export type ConnectorErrorCode =
  | "RATE_LIMITED"
  | "UNAUTHORIZED"
  | "TOKEN_EXPIRED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CIRCUIT_OPEN"
  | "NETWORK_ERROR"
  | "PLATFORM_ERROR"
  | "BATCH_PARTIAL_FAILURE";

export class ConnectorError extends Error {
  constructor(
    public readonly code: ConnectorErrorCode,
    message: string,
    public readonly platform: MarketplacePlatform,
    public readonly retryable: boolean,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public override readonly cause?: unknown,
  ) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "ConnectorError";
  }
}
