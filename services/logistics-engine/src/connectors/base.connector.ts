// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — logistics-engine
// Abstract base connector — retry logic, error normalisation, Circuit Breaker
// ─────────────────────────────────────────────────────────────────────────────

import type { Logger } from "pino";
import {
  ConnectorError,
  type CarrierCapabilities,
  type CarrierCode,
  type ConnectorErrorCode,
} from "../types/carrier.js";

// ─────────────────────────────────────────────────────────────────────────────
// Circuit Breaker state machine
// States: CLOSED → OPEN → HALF_OPEN → CLOSED
// ─────────────────────────────────────────────────────────────────────────────

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit */
  readonly failureThreshold: number;
  /** How long (ms) to wait in OPEN state before moving to HALF_OPEN */
  readonly recoveryTimeoutMs: number;
  /** Number of consecutive successes in HALF_OPEN to close again */
  readonly successThreshold: number;
}

class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureAt: number | null = null;

  constructor(
    private readonly config: CircuitBreakerConfig,
    private readonly carrierCode: CarrierCode,
    private readonly logger: Logger,
  ) {}

  get isOpen(): boolean {
    return this.state === "OPEN";
  }

  /** Must be called before attempting an operation */
  checkState(): void {
    if (this.state === "OPEN") {
      const elapsed = Date.now() - (this.lastFailureAt ?? 0);
      if (elapsed >= this.config.recoveryTimeoutMs) {
        this.state = "HALF_OPEN";
        this.successCount = 0;
        this.logger.info(
          { carrier: this.carrierCode, elapsed },
          "Circuit breaker transitioning OPEN → HALF_OPEN",
        );
      } else {
        throw new ConnectorError(
          "CIRCUIT_OPEN",
          `Circuit breaker is OPEN for carrier ${this.carrierCode}. Retry after ${Math.ceil((this.config.recoveryTimeoutMs - elapsed) / 1000)}s.`,
          this.carrierCode,
        );
      }
    }
  }

  /** Call on successful operation */
  recordSuccess(): void {
    this.failureCount = 0;
    if (this.state === "HALF_OPEN") {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = "CLOSED";
        this.logger.info(
          { carrier: this.carrierCode },
          "Circuit breaker closed after recovery",
        );
      }
    }
  }

  /** Call on failed operation */
  recordFailure(err: unknown): void {
    this.lastFailureAt = Date.now();
    if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.successCount = 0;
      this.logger.warn(
        { carrier: this.carrierCode, err },
        "Circuit breaker re-opened after HALF_OPEN failure",
      );
      return;
    }
    this.failureCount++;
    if (
      this.state === "CLOSED" &&
      this.failureCount >= this.config.failureThreshold
    ) {
      this.state = "OPEN";
      this.logger.error(
        {
          carrier: this.carrierCode,
          failureCount: this.failureCount,
        },
        "Circuit breaker opened after threshold exceeded",
      );
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface RetryConfig {
  /** Maximum number of attempts (including the initial one) */
  readonly maxAttempts: number;
  /** Initial delay in ms (doubles with each retry — exponential backoff) */
  readonly initialDelayMs: number;
  /** Maximum delay cap in ms */
  readonly maxDelayMs: number;
  /** Jitter factor 0..1 applied to the delay */
  readonly jitterFactor: number;
  /** HTTP status codes that should NOT be retried */
  readonly nonRetryableStatuses: readonly number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 10_000,
  jitterFactor: 0.2,
  nonRetryableStatuses: [400, 401, 403, 404, 422],
};

// ─────────────────────────────────────────────────────────────────────────────
// HTTP request helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface RequestOptions {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  /** Request timeout in ms */
  readonly timeoutMs?: number;
}

export interface HttpResponse<T = unknown> {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly data: T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Abstract base connector
// ─────────────────────────────────────────────────────────────────────────────

export abstract class BaseConnector {
  protected readonly logger: Logger;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryConfig: RetryConfig;

  constructor(
    public readonly code: CarrierCode,
    public readonly capabilities: CarrierCapabilities,
    logger: Logger,
    cbConfig?: Partial<CircuitBreakerConfig>,
    retryConfig?: Partial<RetryConfig>,
  ) {
    this.logger = logger.child({ carrier: code });
    this.circuitBreaker = new CircuitBreaker(
      {
        failureThreshold: cbConfig?.failureThreshold ?? 5,
        recoveryTimeoutMs: cbConfig?.recoveryTimeoutMs ?? 30_000,
        successThreshold: cbConfig?.successThreshold ?? 2,
      },
      code,
      this.logger,
    );
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  // ── Protected helpers ─────────────────────────────────────────────────────

  /**
   * Execute a function with circuit breaker protection and exponential backoff.
   * Should be used for all carrier API calls.
   */
  protected async withResilience<T>(
    operationName: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    this.circuitBreaker.checkState();

    let lastError: unknown;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        const result = await fn();
        this.circuitBreaker.recordSuccess();
        return result;
      } catch (err: unknown) {
        lastError = err;

        // Do not retry non-retryable ConnectorErrors
        if (err instanceof ConnectorError) {
          if (
            err.statusCode !== undefined &&
            this.retryConfig.nonRetryableStatuses.includes(err.statusCode)
          ) {
            this.circuitBreaker.recordFailure(err);
            throw err;
          }
          if (err.code === "CIRCUIT_OPEN") throw err;
        }

        const isLastAttempt = attempt === this.retryConfig.maxAttempts;
        if (isLastAttempt) {
          this.circuitBreaker.recordFailure(err);
          break;
        }

        const delay = this.calculateDelay(attempt);
        this.logger.warn(
          {
            operation: operationName,
            attempt,
            maxAttempts: this.retryConfig.maxAttempts,
            nextRetryMs: delay,
            err,
          },
          "Carrier API call failed, retrying",
        );

        await sleep(delay);
      }
    }

    throw this.normaliseError(lastError, "CARRIER_API_ERROR");
  }

  /**
   * Make a typed HTTP request with proper timeout handling.
   */
  protected async httpRequest<T>(options: RequestOptions): Promise<HttpResponse<T>> {
    const timeoutMs = options.timeoutMs ?? 15_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const bodyContent = options.body !== undefined ? JSON.stringify(options.body) : null;
    const defaultHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "EcomPilot-LogisticsEngine/1.0",
    };

    try {
      const response = await fetch(options.url, {
        method: options.method,
        headers: { ...defaultHeaders, ...options.headers },
        ...(bodyContent !== null && { body: bodyContent }),
        signal: controller.signal,
      });

      const responseText = await response.text();
      let data: T;

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json") && responseText.length > 0) {
        data = JSON.parse(responseText) as T;
      } else {
        data = responseText as unknown as T;
      }

      // Collect headers into a plain object
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return { status: response.status, headers, data };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new ConnectorError(
          "TIMEOUT",
          `Request to ${options.url} timed out after ${timeoutMs}ms`,
          this.code,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Normalise an unknown caught error into a ConnectorError.
   */
  protected normaliseError(
    err: unknown,
    defaultCode: ConnectorErrorCode,
    statusCode?: number,
  ): ConnectorError {
    if (err instanceof ConnectorError) return err;
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "Unknown carrier API error";
    return new ConnectorError(defaultCode, message, this.code, statusCode, err);
  }

  /**
   * Assert HTTP response is successful; throw ConnectorError otherwise.
   */
  protected assertSuccessStatus(
    status: number,
    body: unknown,
    operationName: string,
  ): void {
    if (status >= 200 && status < 300) return;

    const errorMessage = extractErrorMessage(body) ?? `HTTP ${status} from ${operationName}`;

    if (status === 401 || status === 403) {
      throw new ConnectorError("UNAUTHORIZED", errorMessage, this.code, status, body);
    }
    if (status === 404) {
      throw new ConnectorError("NOT_FOUND", errorMessage, this.code, status, body);
    }
    if (status === 422) {
      throw new ConnectorError("VALIDATION_ERROR", errorMessage, this.code, status, body);
    }
    if (status === 429) {
      throw new ConnectorError("RATE_LIMITED", errorMessage, this.code, status, body);
    }
    throw new ConnectorError("CARRIER_API_ERROR", errorMessage, this.code, status, body);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private calculateDelay(attempt: number): number {
    const exponential = this.retryConfig.initialDelayMs * 2 ** (attempt - 1);
    const capped = Math.min(exponential, this.retryConfig.maxDelayMs);
    const jitter = capped * this.retryConfig.jitterFactor * Math.random();
    return Math.round(capped + jitter);
  }

  /** Expose circuit breaker state for health checks */
  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level utilities
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorMessage(body: unknown): string | null {
  if (body === null || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  for (const key of ["message", "error", "detail", "details", "description", "errors"]) {
    const val = obj[key];
    if (typeof val === "string") return val;
    if (Array.isArray(val) && val.length > 0) {
      const first = val[0];
      if (typeof first === "string") return first;
      if (typeof first === "object" && first !== null) {
        const inner = (first as Record<string, unknown>)["message"];
        if (typeof inner === "string") return inner;
      }
    }
  }
  return null;
}
