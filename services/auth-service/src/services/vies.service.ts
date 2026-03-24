// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — auth-service: VIES VAT validation service
//
// Calls the EU VIES REST API to validate VAT numbers.
// Endpoint: POST https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number
//
// Caching: Redis TTL 7 days (key: vies:{countryCode}{vatNumber})
// Concurrency: max 5 simultaneous in-flight requests via semaphore queue
// Retry: exponential backoff on 5xx responses (3 attempts)
// Timeout: 10 seconds per request
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { getRedis } from "./redis.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const VIES_URL =
  "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";
const USER_AGENT = "EcomPilot/1.0 (ecompilot.pl; contact@ecompilot.pl)";
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const MAX_CONCURRENT = 5;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Input validation schemas
// ─────────────────────────────────────────────────────────────────────────────

export const ViesRequestSchema = z.object({
  countryCode: z
    .string()
    .length(2, "Country code must be exactly 2 letters")
    .regex(/^[A-Z]{2}$/, "Country code must be 2 uppercase letters"),
  vatNumber: z
    .string()
    .min(1, "VAT number is required")
    .max(20, "VAT number too long")
    .regex(/^[A-Z0-9+*.-]{1,20}$/i, "Invalid VAT number format"),
});

export type ViesRequest = z.infer<typeof ViesRequestSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Response types
// ─────────────────────────────────────────────────────────────────────────────

export interface ViesApiResponse {
  readonly isValid: boolean;
  readonly requestDate: string;
  readonly userError: string;
  readonly name: string | null;
  readonly address: string | null;
  readonly requestIdentifier: string | null;
}

export interface ViesCheckResult {
  readonly valid: boolean;
  readonly name: string | undefined;
  readonly address: string | undefined;
  readonly requestDate: string;
  readonly cached: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Semaphore — limits concurrent VIES requests to MAX_CONCURRENT
// ─────────────────────────────────────────────────────────────────────────────

class Semaphore {
  private _running = 0;
  private readonly _queue: Array<() => void> = [];

  constructor(private readonly _max: number) {}

  async acquire(): Promise<void> {
    if (this._running < this._max) {
      this._running++;
      return;
    }
    await new Promise<void>((resolve) => {
      this._queue.push(resolve);
    });
    this._running++;
  }

  release(): void {
    this._running--;
    const next = this._queue.shift();
    if (next !== undefined) {
      next();
    }
  }
}

const semaphore = new Semaphore(MAX_CONCURRENT);

// ─────────────────────────────────────────────────────────────────────────────
// Retry helper with exponential backoff
// ─────────────────────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  baseDelayMs: number,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Only retry on retryable errors (5xx, network errors)
      const isRetryable =
        err instanceof ViesRetryableError ||
        (err instanceof Error &&
          (err.message.includes("fetch failed") ||
            err.message.includes("ECONNRESET") ||
            err.message.includes("ETIMEDOUT")));

      if (!isRetryable || attempt === maxAttempts) {
        throw err;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom error types
// ─────────────────────────────────────────────────────────────────────────────

export class ViesRetryableError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "ViesRetryableError";
  }
}

export class ViesValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ViesValidationError";
  }
}

export class ViesServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ViesServiceUnavailableError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Redis cache helpers
// ─────────────────────────────────────────────────────────────────────────────

function cacheKey(countryCode: string, vatNumber: string): string {
  return `vies:${countryCode.toUpperCase()}${vatNumber.toUpperCase()}`;
}

async function getCached(
  countryCode: string,
  vatNumber: string,
): Promise<ViesCheckResult | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(cacheKey(countryCode, vatNumber));
    if (raw === null) return null;
    return JSON.parse(raw) as ViesCheckResult;
  } catch {
    // Cache miss on error — proceed to live lookup
    return null;
  }
}

async function setCached(
  countryCode: string,
  vatNumber: string,
  result: ViesCheckResult,
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(
      cacheKey(countryCode, vatNumber),
      JSON.stringify(result),
      { EX: CACHE_TTL_SECONDS },
    );
  } catch {
    // Cache write failure is non-fatal
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core VIES API call
// ─────────────────────────────────────────────────────────────────────────────

async function callViesApi(
  countryCode: string,
  vatNumber: string,
): Promise<ViesApiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(VIES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ countryCode, vatNumber }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ViesServiceUnavailableError(
        "VIES API request timed out after 10 seconds",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status >= 500) {
    throw new ViesRetryableError(
      `VIES API server error: ${response.status.toString()}`,
      response.status,
    );
  }

  if (response.status === 429) {
    throw new ViesRetryableError(
      "VIES API rate limit exceeded",
      response.status,
    );
  }

  if (!response.ok) {
    throw new ViesValidationError(
      `VIES API returned ${response.status.toString()}: ${response.statusText}`,
    );
  }

  const data = (await response.json()) as ViesApiResponse;
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a VAT number is valid via the VIES REST API.
 *
 * Results are cached in Redis for 7 days.
 * At most MAX_CONCURRENT requests are sent to VIES simultaneously.
 * 5xx responses are retried up to MAX_RETRIES times with exponential backoff.
 */
export async function checkVatNumber(
  input: ViesRequest,
): Promise<ViesCheckResult> {
  const { countryCode, vatNumber } = input;
  const normalizedCountry = countryCode.toUpperCase();
  const normalizedVat = vatNumber.trim();

  // Cache-first lookup
  const cached = await getCached(normalizedCountry, normalizedVat);
  if (cached !== null) {
    return { ...cached, cached: true };
  }

  // Acquire concurrency slot before making the HTTP request
  await semaphore.acquire();
  try {
    // Double-check cache after acquiring slot (another request may have populated it)
    const cachedAfterAcquire = await getCached(normalizedCountry, normalizedVat);
    if (cachedAfterAcquire !== null) {
      return { ...cachedAfterAcquire, cached: true };
    }

    const apiResponse = await withRetry(
      () => callViesApi(normalizedCountry, normalizedVat),
      MAX_RETRIES,
      RETRY_BASE_DELAY_MS,
    );

    const result: ViesCheckResult = {
      valid: apiResponse.isValid,
      name:
        apiResponse.name !== null && apiResponse.name.trim().length > 0
          ? apiResponse.name.trim()
          : undefined,
      address:
        apiResponse.address !== null && apiResponse.address.trim().length > 0
          ? apiResponse.address.trim()
          : undefined,
      requestDate: apiResponse.requestDate,
      cached: false,
    };

    await setCached(normalizedCountry, normalizedVat, result);
    return result;
  } finally {
    semaphore.release();
  }
}
