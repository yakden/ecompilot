// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — logistics-engine
// InPost Points Service — 24,700+ Paczkomatów & POP points (public, no auth)
//
// API: GET https://api-pl-points.easypack24.net/v1/points
// Auth: none — fully public
// Cache: Redis TTL 6h (points change infrequently)
// ─────────────────────────────────────────────────────────────────────────────

import type { Logger } from "pino";
import type { RedisCache } from "./redis-cache.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const INPOST_POINTS_BASE_URL = "https://api-pl-points.easypack24.net/v1/points" as const;
const CACHE_TTL_SECONDS = 6 * 60 * 60; // 6 hours
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = "EcomPilot/1.0";

// ─────────────────────────────────────────────────────────────────────────────
// API response types (raw shape from easypack24)
// ─────────────────────────────────────────────────────────────────────────────

interface RawInPostPointAddress {
  readonly line1: string;
  readonly line2: string;
}

interface RawInPostPointLocation {
  readonly latitude: number;
  readonly longitude: number;
}

interface RawInPostPoint {
  readonly name: string;
  readonly address: RawInPostPointAddress;
  readonly location: RawInPostPointLocation;
  readonly type: string;
  readonly status: string;
  readonly functions: readonly string[];
  readonly operating_hours?: string;
  readonly location_description?: string;
  readonly open_hours?: string;
}

interface RawInPostPointsResponse {
  readonly items: readonly RawInPostPoint[];
  readonly count?: number;
  readonly total_count?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalised output types
// ─────────────────────────────────────────────────────────────────────────────

export interface InPostPoint {
  readonly name: string;
  readonly address: string;
  readonly lat: number;
  readonly lng: number;
  readonly type: string;
  readonly status: string;
  readonly functions: readonly string[];
  readonly openHours: string | null;
}

export interface InPostPointsResult {
  readonly count: number;
  readonly points: readonly InPostPoint[];
}

export type InPostPointType = "parcel_locker" | "pop" | "parcel_locker_superpop";

// ─────────────────────────────────────────────────────────────────────────────
// Query options
// ─────────────────────────────────────────────────────────────────────────────

export interface InPostPointsQuery {
  readonly lat: number;
  readonly lng: number;
  /** Radius in metres */
  readonly radius: number;
  /** When undefined, both parcel_locker and pop are requested */
  readonly type?: InPostPointType | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class InPostPointsService {
  constructor(
    private readonly redis: RedisCache,
    private readonly logger: Logger,
  ) {}

  // ── Find points near coordinates ──────────────────────────────────────────

  async findNearby(query: InPostPointsQuery): Promise<InPostPointsResult> {
    const cacheKey = this.buildCacheKey(query);

    const cached = await this.getFromCache<InPostPointsResult>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const result = await this.fetchFromApi(query);
    await this.setInCache(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  }

  // ── Get single point by name ───────────────────────────────────────────────

  async findByName(name: string): Promise<InPostPoint | null> {
    const upperName = name.toUpperCase();
    const cacheKey = `inpost:point:${upperName}`;

    const cached = await this.getFromCache<InPostPoint>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const url = new URL(INPOST_POINTS_BASE_URL);
    url.searchParams.set("name", upperName);

    const raw = await this.request<RawInPostPointsResponse>(url.toString());
    if (raw === null || raw.items.length === 0) {
      return null;
    }

    const first = raw.items[0];
    if (first === undefined) return null;

    const point = normalisePoint(first);
    await this.setInCache(cacheKey, point, CACHE_TTL_SECONDS);
    return point;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private buildCacheKey(query: InPostPointsQuery): string {
    const lat = query.lat.toFixed(4);
    const lng = query.lng.toFixed(4);
    const type = query.type ?? "all";
    return `inpost:points:${lat}:${lng}:${query.radius}:${type}`;
  }

  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (err: unknown) {
      this.logger.warn({ err, key }, "InPostPointsService: Redis cache read failed");
      return null;
    }
  }

  private async setInCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (err: unknown) {
      this.logger.warn({ err, key }, "InPostPointsService: Redis cache write failed");
    }
  }

  private async fetchFromApi(query: InPostPointsQuery): Promise<InPostPointsResult> {
    const url = new URL(INPOST_POINTS_BASE_URL);
    url.searchParams.set("relative_point", `${query.lat},${query.lng}`);
    url.searchParams.set("max_distance", String(query.radius));
    url.searchParams.set("per_page", "50");

    const types: InPostPointType[] =
      query.type !== undefined ? [query.type] : ["parcel_locker", "pop"];

    for (const t of types) {
      url.searchParams.append("type[]", t);
    }

    const raw = await this.request<RawInPostPointsResponse>(url.toString());
    if (raw === null) {
      return { count: 0, points: [] };
    }

    const points = raw.items.map(normalisePoint);
    return { count: points.length, points };
  }

  private async request<T>(url: string): Promise<T | null> {
    const result = await doFetch<T>(url, {}, this.logger, "InPostPointsService");
    if (result !== null) return result;
    // 1 retry
    return doFetch<T>(url, {}, this.logger, "InPostPointsService");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalisePoint(raw: RawInPostPoint): InPostPoint {
  const addressLine = [raw.address.line1, raw.address.line2]
    .filter((l) => l !== undefined && l !== "")
    .join(", ");

  return {
    name: raw.name,
    address: addressLine,
    lat: raw.location.latitude,
    lng: raw.location.longitude,
    type: raw.type,
    status: raw.status,
    functions: raw.functions ?? [],
    openHours: raw.open_hours ?? raw.operating_hours ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared fetch helper
// ─────────────────────────────────────────────────────────────────────────────

async function doFetch<T>(
  url: string,
  extraHeaders: Record<string, string>,
  logger: Logger,
  serviceName: string,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...extraHeaders,
      },
    });

    if (!response.ok) {
      logger.warn({ url, status: response.status }, `${serviceName}: API returned non-OK status`);
      return null;
    }

    return (await response.json()) as T;
  } catch (err: unknown) {
    logger.warn({ err, url }, `${serviceName}: API request failed`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
