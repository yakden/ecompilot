// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — calc-service
// GeoNames postal code validation service
//
// Free tier: 10,000 req/day, 1,000 req/hour
// Auth: username query param (register at geonames.org)
// Cache TTL: 90 days — postal codes are very stable
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, type RedisClientType } from "redis";
import { createLogger } from "@ecompilot/shared-observability";
import { z } from "zod";

const logger = createLogger({ service: "calc-service", module: "geonames" });

// ─── Constants ────────────────────────────────────────────────────────────────

const GEONAMES_BASE = "http://api.geonames.org";
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
const CACHE_PREFIX = "geonames:postal:";
const MAX_RETRIES = 1;

// ─── GeoNames response schema ─────────────────────────────────────────────────

const GeoNamesPostalCodeSchema = z.object({
  postalCode: z.string(),
  placeName: z.string(),
  adminName1: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  countryCode: z.string(),
});

const GeoNamesResponseSchema = z.object({
  postalCodes: z.array(GeoNamesPostalCodeSchema).default([]),
  status: z
    .object({
      message: z.string(),
      value: z.number(),
    })
    .optional(),
});

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PostalCodePlace {
  readonly postalCode: string;
  readonly city: string;
  readonly province: string | null;
  readonly lat: number;
  readonly lng: number;
}

export interface PostalCodeValidationResult {
  readonly valid: boolean;
  readonly places: readonly PostalCodePlace[];
}

// ─── Redis client (lazy singleton) ────────────────────────────────────────────

let redisClient: RedisClientType | null = null;

function getRedis(redisUrl: string): RedisClientType {
  if (redisClient !== null) return redisClient;

  redisClient = createClient({ url: redisUrl }) as RedisClientType;
  redisClient.on("error", (err: unknown) => {
    logger.error({ err }, "Redis client error (geonames)");
  });

  redisClient.connect().catch((err: unknown) => {
    logger.warn({ err }, "Redis connect failed — geonames cache disabled");
  });

  return redisClient;
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

async function cacheGet(redis: RedisClientType, key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

async function cacheSet(redis: RedisClientType, key: string, value: string): Promise<void> {
  try {
    await redis.set(key, value, { EX: CACHE_TTL_SECONDS });
  } catch (err) {
    logger.warn({ err, key }, "Failed to write geonames cache entry");
  }
}

// ─── HTTP fetch with timeout & retry ──────────────────────────────────────────

async function fetchWithRetry(url: string, attempt = 0): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: controller.signal,
    });

    if (response.status >= 500 && attempt < MAX_RETRIES) {
      logger.warn({ status: response.status, attempt }, "GeoNames 5xx — retrying");
      return fetchWithRetry(url, attempt + 1);
    }

    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Polish postal code validator (NN-NNN format) ─────────────────────────────

const POLISH_POSTAL_REGEX = /^\d{2}-\d{3}$/;

function normalizePostalCode(code: string): string {
  const trimmed = code.trim();
  // Accept both "12-345" and "12345" — normalise to "12-345"
  if (/^\d{5}$/.test(trimmed)) {
    return `${trimmed.slice(0, 2)}-${trimmed.slice(2)}`;
  }
  return trimmed;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate a Polish postal code and return matching places.
 * Results cached in Redis for 90 days.
 */
export async function validatePostalCode(
  rawCode: string,
  username: string,
  redisUrl: string,
): Promise<PostalCodeValidationResult> {
  const normalised = normalizePostalCode(rawCode);

  if (!POLISH_POSTAL_REGEX.test(normalised)) {
    return { valid: false, places: [] };
  }

  const redis = getRedis(redisUrl);
  const cacheKey = `${CACHE_PREFIX}${normalised}`;

  const cached = await cacheGet(redis, cacheKey);
  if (cached !== null) {
    try {
      return JSON.parse(cached) as PostalCodeValidationResult;
    } catch {
      // Fall through to live call
    }
  }

  const url =
    `${GEONAMES_BASE}/postalCodeSearchJSON` +
    `?postalcode=${encodeURIComponent(normalised)}` +
    `&country=PL` +
    `&maxRows=10` +
    `&username=${encodeURIComponent(username)}`;

  const response = await fetchWithRetry(url);

  if (!response.ok) {
    throw new Error(`GeoNames API error: HTTP ${response.status}`);
  }

  const raw: unknown = await response.json();
  const parsed = GeoNamesResponseSchema.safeParse(raw);

  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues, code: normalised }, "Unexpected GeoNames response schema");
    throw new Error("Invalid response from GeoNames API");
  }

  if (parsed.data.status !== undefined) {
    // GeoNames embeds API errors as { status: { message, value } }
    logger.warn({ status: parsed.data.status, code: normalised }, "GeoNames API returned status error");
    throw new Error(`GeoNames error: ${parsed.data.status.message}`);
  }

  const places: PostalCodePlace[] = parsed.data.postalCodes.map((p) => ({
    postalCode: p.postalCode,
    city: p.placeName,
    province: p.adminName1 ?? null,
    lat: p.lat,
    lng: p.lng,
  }));

  const result: PostalCodeValidationResult = {
    valid: places.length > 0,
    places,
  };

  await cacheSet(redis, cacheKey, JSON.stringify(result));

  return result;
}

/**
 * Disconnect Redis client — call during graceful shutdown.
 */
export async function closeGeoNamesRedis(): Promise<void> {
  if (redisClient !== null) {
    try {
      await redisClient.quit();
    } catch {
      // Best-effort
    }
    redisClient = null;
  }
}
