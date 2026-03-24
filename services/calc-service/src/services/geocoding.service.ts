// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — calc-service
// Nominatim / OpenStreetMap geocoding & reverse-geocoding
//
// CRITICAL COMPLIANCE:
//   • 1 request per second hard limit (Nominatim TOS)
//   • User-Agent header required on every call (Nominatim TOS)
//   • Redis cache TTL 30 days — addresses are stable
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, type RedisClientType } from "redis";
import { createLogger } from "@ecompilot/shared-observability";
import { z } from "zod";

const logger = createLogger({ service: "calc-service", module: "geocoding" });

// ─── Constants ────────────────────────────────────────────────────────────────

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "EcomPilot/1.0 (ecompilot.pl; contact@ecompilot.pl)";
const QUEUE_INTERVAL_MS = 1_000; // strict 1 req/sec
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const CACHE_PREFIX = "geocoding:";
const MAX_RETRIES = 1;

// ─── Nominatim response shapes ────────────────────────────────────────────────

const NominatimAddressSchema = z.object({
  road: z.string().optional(),
  house_number: z.string().optional(),
  city: z.string().optional(),
  town: z.string().optional(),
  village: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
  country_code: z.string().optional(),
});

const NominatimResultSchema = z.object({
  place_id: z.number(),
  lat: z.string(),
  lon: z.string(),
  display_name: z.string(),
  address: NominatimAddressSchema.optional(),
});

const NominatimSearchResponseSchema = z.array(NominatimResultSchema);

const NominatimReverseResponseSchema = NominatimResultSchema.extend({
  error: z.string().optional(),
});

// ─── Public types ─────────────────────────────────────────────────────────────

export interface GeocodingResult {
  readonly lat: number;
  readonly lng: number;
  readonly displayName: string;
  readonly city: string | null;
  readonly postcode: string | null;
  readonly country: string | null;
}

export interface GeocodingSearchResponse {
  readonly results: readonly GeocodingResult[];
}

// ─── Queue implementation ─────────────────────────────────────────────────────

type QueueTask<T> = {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const taskQueue: Array<QueueTask<any>> = [];
let queueTimer: ReturnType<typeof setInterval> | null = null;

function ensureQueueRunning(): void {
  if (queueTimer !== null) return;
  queueTimer = setInterval(() => {
    const task = taskQueue.shift();
    if (task === undefined) {
      if (taskQueue.length === 0 && queueTimer !== null) {
        clearInterval(queueTimer);
        queueTimer = null;
      }
      return;
    }
    task.execute().then(task.resolve, task.reject);
  }, QUEUE_INTERVAL_MS);

  // Prevent the timer from keeping the process alive when idle
  if (queueTimer.unref) queueTimer.unref();
}

function enqueue<T>(execute: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    taskQueue.push({ execute, resolve, reject });
    ensureQueueRunning();
  });
}

// ─── Redis client (lazy singleton) ────────────────────────────────────────────

let redisClient: RedisClientType | null = null;

function getRedis(redisUrl: string): RedisClientType {
  if (redisClient !== null) return redisClient;

  redisClient = createClient({ url: redisUrl }) as RedisClientType;
  redisClient.on("error", (err: unknown) => {
    logger.error({ err }, "Redis client error (geocoding)");
  });

  // Connect asynchronously; cache misses fall back to live calls gracefully
  redisClient.connect().catch((err: unknown) => {
    logger.warn({ err }, "Redis connect failed — geocoding cache disabled");
  });

  return redisClient;
}

// ─── Cache helpers ─────────────────────────────────────────────────────────────

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
    logger.warn({ err, key }, "Failed to write geocoding cache entry");
  }
}

// ─── HTTP fetch with timeout & retry ─────────────────────────────────────────

async function fetchNominatim(url: string, attempt = 0): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
      signal: controller.signal,
    });

    if (response.status >= 500 && attempt < MAX_RETRIES) {
      logger.warn({ status: response.status, url, attempt }, "Nominatim 5xx — retrying via queue");
      return enqueue(() => fetchNominatim(url, attempt + 1));
    }

    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Result mappers ───────────────────────────────────────────────────────────

function resolveCity(address: z.infer<typeof NominatimAddressSchema> | undefined): string | null {
  if (address === undefined) return null;
  return address.city ?? address.town ?? address.village ?? null;
}

function mapResult(raw: z.infer<typeof NominatimResultSchema>): GeocodingResult {
  return {
    lat: parseFloat(raw.lat),
    lng: parseFloat(raw.lon),
    displayName: raw.display_name,
    city: resolveCity(raw.address),
    postcode: raw.address?.postcode ?? null,
    country: raw.address?.country ?? null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Forward geocoding: address string → coordinates.
 * Results are scoped to Poland (countrycodes=pl) with up to 5 candidates.
 * Results are cached in Redis for 30 days.
 */
export async function geocodeAddress(
  address: string,
  redisUrl: string,
): Promise<GeocodingSearchResponse> {
  const redis = getRedis(redisUrl);
  const cacheKey = `${CACHE_PREFIX}search:${address.toLowerCase().trim()}`;

  const cached = await cacheGet(redis, cacheKey);
  if (cached !== null) {
    try {
      return JSON.parse(cached) as GeocodingSearchResponse;
    } catch {
      // Corrupted cache entry — fall through to live call
    }
  }

  const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(address)}&format=json&countrycodes=pl&limit=5&addressdetails=1`;

  const response = await enqueue(() => fetchNominatim(url));

  if (!response.ok) {
    throw new Error(`Nominatim search failed: HTTP ${response.status}`);
  }

  const raw: unknown = await response.json();
  const parsed = NominatimSearchResponseSchema.safeParse(raw);

  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues, address }, "Unexpected Nominatim search schema");
    throw new Error("Invalid response from Nominatim geocoding API");
  }

  const result: GeocodingSearchResponse = {
    results: parsed.data.map(mapResult),
  };

  await cacheSet(redis, cacheKey, JSON.stringify(result));

  return result;
}

/**
 * Reverse geocoding: coordinates → address.
 * Result is cached in Redis for 30 days.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  redisUrl: string,
): Promise<GeocodingResult> {
  const redis = getRedis(redisUrl);

  // Round to 5 decimal places for cache key (~1m precision)
  const latKey = lat.toFixed(5);
  const lngKey = lng.toFixed(5);
  const cacheKey = `${CACHE_PREFIX}reverse:${latKey},${lngKey}`;

  const cached = await cacheGet(redis, cacheKey);
  if (cached !== null) {
    try {
      return JSON.parse(cached) as GeocodingResult;
    } catch {
      // Fall through
    }
  }

  const url = `${NOMINATIM_BASE}/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&format=json&addressdetails=1`;

  const response = await enqueue(() => fetchNominatim(url));

  if (!response.ok) {
    throw new Error(`Nominatim reverse geocode failed: HTTP ${response.status}`);
  }

  const raw: unknown = await response.json();
  const parsed = NominatimReverseResponseSchema.safeParse(raw);

  if (!parsed.success || parsed.data.error !== undefined) {
    const errMsg = parsed.success ? parsed.data.error : "Invalid Nominatim reverse schema";
    throw new Error(`Nominatim reverse geocode error: ${errMsg ?? "unknown"}`);
  }

  const result = mapResult(parsed.data);

  await cacheSet(redis, cacheKey, JSON.stringify(result));

  return result;
}

/**
 * Disconnect Redis client — call during graceful shutdown.
 */
export async function closeGeocodingRedis(): Promise<void> {
  if (redisClient !== null) {
    try {
      await redisClient.quit();
    } catch {
      // Best-effort
    }
    redisClient = null;
  }
}
