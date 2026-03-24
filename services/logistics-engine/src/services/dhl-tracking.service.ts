// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — logistics-engine
// DHL Tracking Service — Unified Tracking API (250 req/day free tier)
//
// API: GET https://api-eu.dhl.com/track/shipments
// Auth: Header DHL-API-Key
// Rate limit: 250/day, ≥1 req/5s
// Cache: Redis TTL 30 min
// ─────────────────────────────────────────────────────────────────────────────

import type { Logger } from "pino";
import type { RedisCache } from "./redis-cache.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DHL_TRACKING_URL = "https://api-eu.dhl.com/track/shipments" as const;
const CACHE_TTL_SECONDS = 30 * 60; // 30 minutes
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = "EcomPilot/1.0";
/** Minimum gap between outbound requests to respect the 1 req/5s rate limit */
const RATE_LIMIT_MS = 5_000;

// ─────────────────────────────────────────────────────────────────────────────
// API response types (raw DHL Unified Tracking API shape)
// ─────────────────────────────────────────────────────────────────────────────

interface RawDhlLocation {
  readonly address?: {
    readonly addressLocality?: string;
    readonly countryCode?: string;
  };
}

interface RawDhlEvent {
  readonly timestamp: string;
  readonly location?: RawDhlLocation;
  readonly description?: string;
  readonly status?: string;
}

interface RawDhlStatus {
  readonly timestamp?: string;
  readonly location?: RawDhlLocation;
  readonly status?: string;
  readonly description?: string;
  readonly estimatedTimeOfDelivery?: string;
}

interface RawDhlShipment {
  readonly id: string;
  readonly service?: string;
  readonly origin?: RawDhlLocation;
  readonly destination?: RawDhlLocation;
  readonly status?: RawDhlStatus;
  readonly events?: readonly RawDhlEvent[];
  readonly estimatedTimeOfDelivery?: string;
}

interface RawDhlTrackingResponse {
  readonly shipments: readonly RawDhlShipment[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalised output types
// ─────────────────────────────────────────────────────────────────────────────

export interface DhlTrackingEvent {
  readonly date: string;
  readonly location: string;
  readonly description: string;
  readonly status: string;
}

export interface DhlShipmentInfo {
  readonly trackingNumber: string;
  readonly service: string;
  readonly status: string;
  readonly origin: string;
  readonly destination: string;
  readonly events: readonly DhlTrackingEvent[];
  readonly estimatedDelivery: string | null;
}

export type DhlTrackingResult =
  | { readonly found: true; readonly shipment: DhlShipmentInfo }
  | { readonly found: false };

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class DhlTrackingService {
  /** Timestamp (ms) of the last successful outbound request */
  private lastRequestAt = 0;

  constructor(
    private readonly redis: RedisCache,
    private readonly logger: Logger,
    private readonly apiKey: string | undefined,
  ) {}

  // ── Track a shipment ───────────────────────────────────────────────────────

  async track(trackingNumber: string): Promise<DhlTrackingResult> {
    if (this.apiKey === undefined) {
      this.logger.warn("DhlTrackingService: DHL_API_KEY not configured — skipping");
      return { found: false };
    }

    const cacheKey = `dhl:tracking:${trackingNumber}`;

    const cached = await this.getFromCache(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const raw = await this.fetchFromApi(trackingNumber);
    if (raw === null) {
      return { found: false };
    }

    const result = normaliseResponse(trackingNumber, raw);
    if (result.found) {
      await this.setInCache(cacheKey, result);
    }
    return result;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async getFromCache(key: string): Promise<DhlTrackingResult | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as DhlTrackingResult;
    } catch (err: unknown) {
      this.logger.warn({ err, key }, "DhlTrackingService: Redis cache read failed");
      return null;
    }
  }

  private async setInCache(key: string, value: DhlTrackingResult): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), "EX", CACHE_TTL_SECONDS);
    } catch (err: unknown) {
      this.logger.warn({ err, key }, "DhlTrackingService: Redis cache write failed");
    }
  }

  private async enforceRateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < RATE_LIMIT_MS) {
      await sleep(RATE_LIMIT_MS - elapsed);
    }
  }

  private async fetchFromApi(trackingNumber: string): Promise<RawDhlTrackingResponse | null> {
    await this.enforceRateLimit();
    this.lastRequestAt = Date.now();

    const url = new URL(DHL_TRACKING_URL);
    url.searchParams.set("trackingNumber", trackingNumber);

    const result = await this.doRequest<RawDhlTrackingResponse>(url.toString());
    if (result !== null) return result;

    // 1 retry on 5xx / network error
    await this.enforceRateLimit();
    this.lastRequestAt = Date.now();
    return this.doRequest<RawDhlTrackingResponse>(url.toString());
  }

  private async doRequest<T>(url: string): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          // Non-null assertion is safe: doRequest is only called when apiKey is defined
          // (checked in track() before fetching).
          "DHL-API-Key": this.apiKey!,
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        this.logger.warn(
          { url, status: response.status },
          "DhlTrackingService: API returned non-OK status",
        );
        return null;
      }

      return (await response.json()) as T;
    } catch (err: unknown) {
      this.logger.warn({ err, url }, "DhlTrackingService: API request failed");
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation helpers
// ─────────────────────────────────────────────────────────────────────────────

function normaliseResponse(
  trackingNumber: string,
  raw: RawDhlTrackingResponse,
): DhlTrackingResult {
  if (raw.shipments.length === 0) {
    return { found: false };
  }

  const shipment = raw.shipments[0];
  if (shipment === undefined) return { found: false };

  const events: DhlTrackingEvent[] = (shipment.events ?? []).map((e) => ({
    date: e.timestamp,
    location: formatLocation(e.location),
    description: e.description ?? "",
    status: e.status ?? "",
  }));

  const estimatedDelivery =
    shipment.estimatedTimeOfDelivery ?? shipment.status?.estimatedTimeOfDelivery ?? null;

  return {
    found: true,
    shipment: {
      trackingNumber: shipment.id ?? trackingNumber,
      service: shipment.service ?? "DHL",
      status: shipment.status?.description ?? shipment.status?.status ?? "unknown",
      origin: formatLocation(shipment.origin),
      destination: formatLocation(shipment.destination),
      events,
      estimatedDelivery: estimatedDelivery ?? null,
    },
  };
}

function formatLocation(loc: RawDhlLocation | undefined): string {
  if (loc === undefined) return "";
  const parts = [loc.address?.addressLocality, loc.address?.countryCode].filter(
    (p): p is string => p !== undefined && p !== "",
  );
  return parts.join(", ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
