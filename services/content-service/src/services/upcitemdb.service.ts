// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — content-service
// UPCitemdb integration — 690 M+ barcodes
// Free tier: 100 lookups/day (IP-based), 6/min
// Docs: https://www.upcitemdb.com/api/explorer#!/lookup/get_trial_lookup
// ─────────────────────────────────────────────────────────────────────────────

import { getRedisClient } from "./redis.client.js";
import { createLogger } from "@ecompilot/shared-observability";

const logger = createLogger({ service: "content-service" });

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const UPC_BASE_URL = "https://api.upcitemdb.com/prod/trial/lookup";
/** 30 days — product catalogue data is very stable */
const CACHE_TTL_SECONDS = 30 * 24 * 3_600;
/** Redis key that tracks daily usage; resets at midnight UTC */
const DAILY_COUNTER_PREFIX = "upcitemdb:daily:";
/** Free tier hard limit */
const DAILY_LIMIT = 100;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RETRIES = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Types — UPCitemdb raw API response
// ─────────────────────────────────────────────────────────────────────────────

interface UpcItemdbItemRaw {
  readonly title?: string;
  readonly brand?: string;
  readonly category?: string;
  readonly images?: ReadonlyArray<string>;
  readonly offers?: ReadonlyArray<{
    readonly merchant?: string;
    readonly price?: number;
  }>;
  readonly description?: string;
  readonly model?: string;
  readonly color?: string;
  readonly size?: string;
  readonly weight?: string;
}

interface UpcItemdbApiResponse {
  readonly code?: string;
  readonly total?: number;
  readonly items?: ReadonlyArray<UpcItemdbItemRaw>;
  readonly message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface UpcProduct {
  readonly title: string;
  readonly brand: string;
  readonly category: string;
  readonly images: ReadonlyArray<string>;
  readonly source: "upcitemdb";
}

export type UpcResult =
  | { readonly found: true; readonly product: UpcProduct }
  | { readonly found: false; readonly error?: string };

// ─────────────────────────────────────────────────────────────────────────────
// Daily rate limit counter helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the Redis key for today's UTC date.
 * e.g. "upcitemdb:daily:2026-03-22"
 */
function dailyCounterKey(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${DAILY_COUNTER_PREFIX}${y}-${m}-${d}`;
}

/** Seconds remaining until next UTC midnight */
function secondsUntilMidnightUTC(): number {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return Math.ceil((midnight.getTime() - now.getTime()) / 1_000);
}

/**
 * Atomically increment and return the daily counter.
 * Returns null if Redis is unavailable (fail-open: proceed with request).
 */
async function incrementDailyCounter(): Promise<number | null> {
  try {
    const redis = getRedisClient();
    const key = dailyCounterKey();
    const count = await redis.incr(key);
    if (count === 1) {
      // First call today — set expiry to end of UTC day
      await redis.expire(key, secondsUntilMidnightUTC());
    }
    return count;
  } catch {
    return null;
  }
}

/**
 * Returns the current daily usage count without incrementing.
 */
export async function getDailyUsage(): Promise<number> {
  try {
    const redis = getRedisClient();
    const raw = await redis.get(dailyCounterKey());
    return raw !== null ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────────────────────────

function cacheKey(barcode: string): string {
  return `upcitemdb:product:${barcode}`;
}

async function getCached(key: string): Promise<UpcResult | null> {
  try {
    const redis = getRedisClient();
    const raw = await redis.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as UpcResult;
  } catch {
    return null;
  }
}

async function setCache(key: string, value: UpcResult): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(value));
  } catch {
    // Non-fatal
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Response parser
// ─────────────────────────────────────────────────────────────────────────────

function parseUpcResponse(raw: UpcItemdbApiResponse): UpcResult {
  if (raw.code !== "OK" && raw.code !== undefined) {
    return { found: false, error: raw.message ?? raw.code };
  }

  const items = raw.items ?? [];
  if (items.length === 0 || raw.total === 0) {
    return { found: false, error: "No items found for barcode" };
  }

  // Take the first item — it is the most relevant match
  const item = items[0]!;

  const title = item.title ?? "";
  if (title === "") {
    return { found: false, error: "Item has no title" };
  }

  // Deduplicate and filter empty image URLs
  const images = [...new Set((item.images ?? []).filter((u) => u !== ""))];

  return {
    found: true,
    product: {
      title,
      brand: item.brand ?? "",
      category: item.category ?? "",
      images,
      source: "upcitemdb",
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP fetch with timeout + single retry
// ─────────────────────────────────────────────────────────────────────────────

async function fetchWithRetry(url: string, attempt = 0): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    });
    clearTimeout(timer);

    if ((response.status >= 500 || response.status === 429) && attempt < MAX_RETRIES) {
      logger.warn(
        { status: response.status, attempt, url },
        "UPCitemdb request failed, retrying",
      );
      await new Promise<void>((resolve) => { setTimeout(resolve, 1_000 * (attempt + 1)); });
      return fetchWithRetry(url, attempt + 1);
    }

    return response;
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    if (isTimeout && attempt < MAX_RETRIES) {
      logger.warn({ attempt, url }, "UPCitemdb request timed out, retrying");
      return fetchWithRetry(url, attempt + 1);
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up a product by UPC/EAN barcode in UPCitemdb.
 * Enforces a daily rate limit of 100 requests (free tier) via Redis counter.
 * Results are cached in Redis for 30 days.
 */
export async function lookupProductByBarcode(barcode: string): Promise<UpcResult> {
  const key = cacheKey(barcode);

  // Cache hit — does not consume daily quota
  const cached = await getCached(key);
  if (cached !== null) return cached;

  // Enforce daily limit before spending a real API call
  const dailyCount = await incrementDailyCounter();
  if (dailyCount !== null && dailyCount > DAILY_LIMIT) {
    logger.warn({ dailyCount, limit: DAILY_LIMIT }, "UPCitemdb daily limit reached");
    return { found: false, error: "UPCitemdb daily quota exhausted (100/day free tier)" };
  }

  const url = `${UPC_BASE_URL}?upc=${encodeURIComponent(barcode)}`;

  try {
    const response = await fetchWithRetry(url);

    if (response.status === 404) {
      const result: UpcResult = { found: false, error: "Product not found" };
      await setCache(key, result);
      return result;
    }

    if (response.status === 429) {
      logger.warn({ barcode }, "UPCitemdb rate limit hit (429)");
      return { found: false, error: "UPCitemdb rate limit exceeded" };
    }

    if (!response.ok) {
      logger.warn(
        { status: response.status, barcode },
        "UPCitemdb API returned non-OK status",
      );
      return {
        found: false,
        error: `UPCitemdb API error: HTTP ${String(response.status)}`,
      };
    }

    const json: unknown = await response.json();
    const result = parseUpcResponse(json as UpcItemdbApiResponse);
    // Cache both hits and misses to avoid re-spending quota on repeated unknowns
    await setCache(key, result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, barcode }, "UPCitemdb API call failed");
    return { found: false, error: message };
  }
}
