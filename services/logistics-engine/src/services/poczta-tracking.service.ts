// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — logistics-engine
// Poczta Polska Tracking Service — USS REST API (free, no auth)
//
// API: GET https://uss.poczta-polska.pl/uss/v2.0/tracking/checkmailex
// Auth: none for basic tracking
// Cache: Redis TTL 15 min
// ─────────────────────────────────────────────────────────────────────────────

import type { Logger } from "pino";
import type { RedisCache } from "./redis-cache.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const POCZTA_TRACKING_URL =
  "https://uss.poczta-polska.pl/uss/v2.0/tracking/checkmailex" as const;
const CACHE_TTL_SECONDS = 15 * 60; // 15 minutes
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = "EcomPilot/1.0";

// ─────────────────────────────────────────────────────────────────────────────
// API response types (raw USS v2 shape)
// ─────────────────────────────────────────────────────────────────────────────

interface RawPocztaEvent {
  /** ISO-like timestamp or human-readable string */
  readonly time: string;
  readonly name: string;
  readonly postOffice?: string;
}

interface RawPocztaMailInfo {
  readonly number: string;
  readonly events: readonly RawPocztaEvent[];
  readonly finished: boolean;
  readonly deliveryDate?: string;
}

interface RawPocztaResponse {
  readonly mailInfo?: RawPocztaMailInfo;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalised output types
// ─────────────────────────────────────────────────────────────────────────────

export interface PocztaTrackingEvent {
  readonly date: string;
  readonly description: string;
  readonly location: string;
}

export interface PocztaShipmentInfo {
  readonly trackingNumber: string;
  readonly status: string;
  readonly isDelivered: boolean;
  readonly events: readonly PocztaTrackingEvent[];
  readonly deliveryDate: string | null;
}

export type PocztaTrackingResult =
  | { readonly found: true; readonly shipment: PocztaShipmentInfo }
  | { readonly found: false };

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class PocztaTrackingService {
  constructor(
    private readonly redis: RedisCache,
    private readonly logger: Logger,
  ) {}

  // ── Track a shipment ───────────────────────────────────────────────────────

  async track(number: string): Promise<PocztaTrackingResult> {
    const cacheKey = `poczta:tracking:${number.toUpperCase()}`;

    const cached = await this.getFromCache(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const raw = await this.fetchFromApi(number);
    if (raw === null) {
      return { found: false };
    }

    const result = normaliseResponse(raw);
    if (result.found) {
      await this.setInCache(cacheKey, result);
    }
    return result;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async getFromCache(key: string): Promise<PocztaTrackingResult | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as PocztaTrackingResult;
    } catch (err: unknown) {
      this.logger.warn({ err, key }, "PocztaTrackingService: Redis cache read failed");
      return null;
    }
  }

  private async setInCache(key: string, value: PocztaTrackingResult): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), "EX", CACHE_TTL_SECONDS);
    } catch (err: unknown) {
      this.logger.warn({ err, key }, "PocztaTrackingService: Redis cache write failed");
    }
  }

  private async fetchFromApi(number: string): Promise<RawPocztaMailInfo | null> {
    const url = new URL(POCZTA_TRACKING_URL);
    url.searchParams.set("number", number.toUpperCase());

    const result = await this.doRequest(url.toString());
    if (result !== null) return result;

    // 1 retry on failure
    return this.doRequest(url.toString());
  }

  private async doRequest(url: string): Promise<RawPocztaMailInfo | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        this.logger.warn(
          { url, status: response.status },
          "PocztaTrackingService: API returned non-OK status",
        );
        return null;
      }

      const body = (await response.json()) as RawPocztaResponse;

      // The USS API wraps the result in mailInfo
      if (body.mailInfo === undefined) {
        return null;
      }

      return body.mailInfo;
    } catch (err: unknown) {
      this.logger.warn({ err, url }, "PocztaTrackingService: API request failed");
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation helpers
// ─────────────────────────────────────────────────────────────────────────────

function normaliseResponse(raw: RawPocztaMailInfo): PocztaTrackingResult {
  // If no events and not finished, the tracking number was not found
  if (raw.events.length === 0 && !raw.finished) {
    return { found: false };
  }

  const events: PocztaTrackingEvent[] = raw.events.map((e) => ({
    date: e.time,
    description: e.name,
    location: e.postOffice ?? "",
  }));

  const latestEvent = events[0]?.description ?? "unknown";
  const status = raw.finished ? "delivered" : latestEvent;

  return {
    found: true,
    shipment: {
      trackingNumber: raw.number,
      status,
      isDelivered: raw.finished,
      events,
      deliveryDate: raw.deliveryDate ?? null,
    },
  };
}
