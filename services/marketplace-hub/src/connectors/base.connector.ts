// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — marketplace-hub: Abstract base connector
// Provides Circuit Breaker + Token Bucket Rate Limiter for all marketplace
// connectors. Concrete connectors extend this class.
// ─────────────────────────────────────────────────────────────────────────────

import type { Logger } from "pino";
import type {
  MarketplacePlatform,
  CircuitBreakerConfig,
  CircuitBreakerState,
  RateLimiterConfig,
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
} from "../types/marketplace.js";
import { ConnectorError } from "../types/marketplace.js";

// ─────────────────────────────────────────────────────────────────────────────
// Token Bucket Rate Limiter
// ─────────────────────────────────────────────────────────────────────────────

class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefillAt: number;

  constructor(private readonly config: RateLimiterConfig) {
    this.tokens = config.capacity;
    this.lastRefillAt = Date.now();
  }

  /**
   * Attempt to consume one token. Returns true if token was available,
   * false if the bucket is empty (request should be queued or rejected).
   */
  tryConsume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Consume one token, waiting if necessary. Returns the ms waited.
   */
  async consume(): Promise<number> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }

    // Calculate wait time until next token is available
    const tokensNeeded = 1 - this.tokens;
    const waitMs = Math.ceil((tokensNeeded / this.config.refillRatePerSec) * 1000);
    await sleep(waitMs);
    this.refill();
    this.tokens -= 1;
    return waitMs;
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefillAt) / 1000;
    const newTokens = elapsedSec * this.config.refillRatePerSec;
    if (newTokens > 0) {
      this.tokens = Math.min(this.config.capacity, this.tokens + newTokens);
      this.lastRefillAt = now;
    }
  }

  get availableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Circuit Breaker
// States: CLOSED -> OPEN -> HALF_OPEN -> CLOSED
// ─────────────────────────────────────────────────────────────────────────────

class CircuitBreaker {
  private state: CircuitBreakerState;
  private readonly requestWindow: Array<{ success: boolean; at: number }> = [];

  constructor(
    private readonly config: CircuitBreakerConfig,
    private readonly platform: MarketplacePlatform,
    private readonly logger: Logger,
  ) {
    this.state = { status: "CLOSED", failures: 0, successes: 0 };
  }

  get currentState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws ConnectorError with code CIRCUIT_OPEN when the circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state.status === "OPEN") {
      const elapsed = Date.now() - this.state.openedAt.getTime();
      if (elapsed < this.config.waitDurationMs) {
        throw new ConnectorError(
          "CIRCUIT_OPEN",
          `Circuit breaker is OPEN for ${this.platform}. Retry in ${Math.ceil((this.config.waitDurationMs - elapsed) / 1000)}s`,
          this.platform,
          false,
        );
      }
      // Transition to HALF_OPEN — allow a probe request
      this.logger.warn(
        { platform: this.platform },
        "Circuit breaker transitioning OPEN -> HALF_OPEN",
      );
      this.state = { status: "HALF_OPEN", probeSuccesses: 0 };
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  private onSuccess(): void {
    this.pruneWindow();
    this.requestWindow.push({ success: true, at: Date.now() });

    if (this.state.status === "HALF_OPEN") {
      const probeSuccesses = this.state.probeSuccesses + 1;
      if (probeSuccesses >= this.config.successThreshold) {
        this.logger.info(
          { platform: this.platform },
          "Circuit breaker transitioning HALF_OPEN -> CLOSED",
        );
        this.state = { status: "CLOSED", failures: 0, successes: probeSuccesses };
      } else {
        this.state = { status: "HALF_OPEN", probeSuccesses };
      }
    } else {
      const stats = this.getWindowStats();
      this.state = {
        status: "CLOSED",
        failures: stats.failures,
        successes: stats.successes,
      };
    }
  }

  private onFailure(err: unknown): void {
    this.pruneWindow();
    this.requestWindow.push({ success: false, at: Date.now() });

    if (this.state.status === "HALF_OPEN") {
      // Single failure in HALF_OPEN -> back to OPEN
      this.logger.warn(
        { platform: this.platform, err },
        "Circuit breaker transitioning HALF_OPEN -> OPEN (probe failed)",
      );
      this.state = { status: "OPEN", openedAt: new Date(), failures: 1 };
      return;
    }

    const stats = this.getWindowStats();
    const total = stats.failures + stats.successes;
    if (total >= 5) {
      const failurePct = (stats.failures / total) * 100;
      if (failurePct >= this.config.failureThresholdPct) {
        this.logger.error(
          { platform: this.platform, failurePct: failurePct.toFixed(1) },
          "Circuit breaker transitioning CLOSED -> OPEN",
        );
        this.state = { status: "OPEN", openedAt: new Date(), failures: stats.failures };
        return;
      }
    }

    this.state = {
      status: "CLOSED",
      failures: stats.failures,
      successes: stats.successes,
    };
  }

  private pruneWindow(): void {
    const cutoff = Date.now() - this.config.windowMs;
    let i = 0;
    while (i < this.requestWindow.length && (this.requestWindow[i]?.at ?? 0) < cutoff) {
      i++;
    }
    if (i > 0) {
      this.requestWindow.splice(0, i);
    }
  }

  private getWindowStats(): { failures: number; successes: number } {
    return this.requestWindow.reduce(
      (acc, entry) => {
        if (entry.success) {
          acc.successes++;
        } else {
          acc.failures++;
        }
        return acc;
      },
      { failures: 0, successes: 0 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Abstract BaseConnector
// ─────────────────────────────────────────────────────────────────────────────

export abstract class BaseConnector {
  abstract readonly platform: MarketplacePlatform;
  abstract readonly capabilities: ConnectorCapabilities;

  protected readonly circuitBreaker: CircuitBreaker;
  protected readonly rateLimiter: TokenBucketRateLimiter;

  constructor(
    protected readonly logger: Logger,
    rateLimiterConfig: RateLimiterConfig,
    circuitBreakerConfig: CircuitBreakerConfig = {
      failureThresholdPct: 50,
      windowMs: 60_000,
      waitDurationMs: 30_000,
      successThreshold: 3,
    },
  ) {
    // CircuitBreaker will be initialised after `platform` is set; use a
    // deferred getter pattern — safe because subclasses define `platform`
    // before any async calls can happen.
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig, this.getPlatform(), logger);
    this.rateLimiter = new TokenBucketRateLimiter(rateLimiterConfig);
  }

  // Allow accessing platform before it's fully initialized (via abstract member)
  private getPlatform(): MarketplacePlatform {
    // At construction time we read from the concrete class prototype
    return (this as unknown as { platform: MarketplacePlatform }).platform
      ?? "allegro"; // fallback never reached in practice
  }

  /**
   * Execute a marketplace API call with rate limiting + circuit breaker.
   * All concrete connectors must use this wrapper.
   */
  protected async callApi<T>(fn: () => Promise<T>): Promise<T> {
    const waitedMs = await this.rateLimiter.consume();
    if (waitedMs > 0) {
      this.logger.debug(
        { platform: this.platform, waitedMs },
        "Rate limiter wait",
      );
    }
    return this.circuitBreaker.execute(fn);
  }

  /**
   * Execute with retry for transient errors (5xx, network).
   * Respects circuit breaker — won't retry if circuit is OPEN.
   */
  protected async callApiWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelayMs = 1000,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.callApi(fn);
      } catch (err) {
        if (err instanceof ConnectorError && !err.retryable) {
          throw err;
        }
        lastError = err;
        if (attempt < maxRetries - 1) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          this.logger.warn(
            { platform: this.platform, attempt, delayMs: delay, err },
            "Retrying marketplace API call",
          );
          await sleep(delay);
        }
      }
    }
    throw lastError;
  }

  // ── Abstract interface — implemented by each connector ───────────────────

  abstract getAuthorizationUrl(state: string): string;
  abstract exchangeCode(code: string, state: string): Promise<OAuthTokens>;
  abstract refreshToken(refreshToken: string): Promise<OAuthTokens>;

  abstract createOffer(
    product: CanonicalProduct,
    auth: ConnectorAuthContext,
  ): Promise<ConnectorOfferResult>;

  abstract updateOffer(
    externalOfferId: string,
    product: Partial<CanonicalProduct>,
    auth: ConnectorAuthContext,
  ): Promise<ConnectorOfferResult>;

  abstract deactivateOffer(
    externalOfferId: string,
    auth: ConnectorAuthContext,
  ): Promise<void>;

  abstract getOffer(
    externalOfferId: string,
    auth: ConnectorAuthContext,
  ): Promise<ConnectorOfferResult>;

  abstract listOffers(
    auth: ConnectorAuthContext,
    cursor?: string,
    limit?: number,
  ): Promise<PollResult<ConnectorOfferResult>>;

  abstract getOrders(
    auth: ConnectorAuthContext,
    since: Date,
    cursor?: string,
  ): Promise<PollResult<CanonicalOrder>>;

  abstract getOrder(
    marketplaceOrderId: string,
    auth: ConnectorAuthContext,
  ): Promise<CanonicalOrder>;

  abstract updateOrderStatus(
    marketplaceOrderId: string,
    status: CanonicalOrderStatus,
    auth: ConnectorAuthContext,
  ): Promise<void>;

  abstract addTrackingNumber(
    marketplaceOrderId: string,
    trackingNumber: string,
    carrier: string,
    auth: ConnectorAuthContext,
  ): Promise<void>;

  abstract updateStock(
    update: StockUpdate,
    auth: ConnectorAuthContext,
  ): Promise<StockUpdateResult>;

  abstract batchUpdateStock(
    updates: readonly StockUpdate[],
    auth: ConnectorAuthContext,
  ): Promise<readonly StockUpdateResult[]>;

  abstract pollOrderEvents(
    auth: ConnectorAuthContext,
    lastEventId?: string,
  ): Promise<PollResult<OrderEvent>>;

  abstract pollOfferEvents(
    auth: ConnectorAuthContext,
    lastEventId?: string,
  ): Promise<PollResult<OfferEvent>>;
}
