// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — analytics-service
// UN Comtrade API v1 — trade statistics
//
// Free tier: 500 requests/day (register at comtrade.un.org)
// Country code: 616 = Poland
// flowCode M = Imports
// Cache TTL: 7 days — trade data updates monthly
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, type RedisClientType } from "redis";
import { createLogger } from "@ecompilot/shared-observability";
import { z } from "zod";

const logger = createLogger({ service: "analytics-service", module: "comtrade" });

// ─── Constants ────────────────────────────────────────────────────────────────

const COMTRADE_BASE = "https://comtradeapi.un.org/data/v1/get";
const REPORTER_POLAND = "616";
const FLOW_IMPORTS = "M";
const CLASSIFICATION = "C"; // Commodities
const FREQUENCY = "A"; // Annual
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const CACHE_PREFIX = "comtrade:";
const MAX_RETRIES = 1;

// ─── Comtrade response schema ─────────────────────────────────────────────────

const ComtradeDataRowSchema = z.object({
  refYear: z.number().optional(),
  period: z.union([z.string(), z.number()]).optional(),
  cmdCode: z.string().optional(),
  cmdDesc: z.string().optional(),
  primaryValue: z.number().nullable().optional(),
  qty: z.number().nullable().optional(),
  qtyUnitAbbr: z.string().optional(),
  partnerDesc: z.string().optional(),
  partnerCode: z.union([z.string(), z.number()]).optional(),
});

const ComtradeResponseSchema = z.object({
  data: z.array(ComtradeDataRowSchema).optional(),
  count: z.number().optional(),
  message: z.array(z.string()).optional(),
  statusCode: z.number().optional(),
  error: z.string().optional(),
});

// ─── Public types ─────────────────────────────────────────────────────────────

export type TradeTrend = "up" | "down" | "stable";

export interface TradeDataResult {
  readonly hsCode: string;
  readonly description: string;
  readonly year: number;
  readonly importValueUSD: number;
  readonly importQuantity: number | null;
  readonly quantityUnit: string | null;
  readonly partnerCountry: string;
  readonly trend: TradeTrend;
}

export interface TradeDataResponse {
  readonly found: boolean;
  readonly data?: TradeDataResult;
}

// ─── Redis client (lazy singleton) ────────────────────────────────────────────

let redisClient: RedisClientType | null = null;

function getRedis(redisUrl: string): RedisClientType {
  if (redisClient !== null) return redisClient;

  redisClient = createClient({ url: redisUrl }) as RedisClientType;
  redisClient.on("error", (err: unknown) => {
    logger.error({ err }, "Redis client error (comtrade)");
  });

  redisClient.connect().catch((err: unknown) => {
    logger.warn({ err }, "Redis connect failed — comtrade cache disabled");
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
    logger.warn({ err, key }, "Failed to write comtrade cache entry");
  }
}

// ─── HTTP fetch with timeout & retry ──────────────────────────────────────────

async function fetchWithRetry(url: string, apiKey: string | undefined, attempt = 0): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, REQUEST_TIMEOUT_MS);

  const headers: Record<string, string> = { "Accept": "application/json" };
  if (apiKey !== undefined && apiKey.length > 0) {
    headers["Ocp-Apim-Subscription-Key"] = apiKey;
  }

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    if (response.status >= 500 && attempt < MAX_RETRIES) {
      logger.warn({ status: response.status, attempt }, "Comtrade 5xx — retrying");
      return fetchWithRetry(url, apiKey, attempt + 1);
    }

    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Trend calculation ────────────────────────────────────────────────────────

function calculateTrend(rows: z.infer<typeof ComtradeDataRowSchema>[]): TradeTrend {
  if (rows.length < 2) return "stable";

  // Sort by year ascending
  const sorted = [...rows].sort((a, b) => {
    const yearA = a.refYear ?? Number(a.period ?? 0);
    const yearB = b.refYear ?? Number(b.period ?? 0);
    return yearA - yearB;
  });

  const older = sorted[sorted.length - 2];
  const newest = sorted[sorted.length - 1];

  if (older === undefined || newest === undefined) return "stable";

  const oldValue = older.primaryValue ?? 0;
  const newValue = newest.primaryValue ?? 0;

  if (oldValue === 0) return newValue > 0 ? "up" : "stable";

  const changePct = ((newValue - oldValue) / oldValue) * 100;

  if (changePct > 5) return "up";
  if (changePct < -5) return "down";
  return "stable";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Query UN Comtrade for Polish import statistics.
 *
 * @param hsCode    - HS commodity code (e.g. "8471" for computers)
 * @param partnerCode - UN Comtrade reporter code (e.g. "156" for China)
 * @param redisUrl  - Redis connection string for caching
 * @param apiKey    - Optional Comtrade subscription key
 */
export async function getTradeData(
  hsCode: string,
  partnerCode: string,
  redisUrl: string,
  apiKey: string | undefined,
): Promise<TradeDataResponse> {
  const redis = getRedis(redisUrl);
  const cacheKey = `${CACHE_PREFIX}${REPORTER_POLAND}:${partnerCode}:${hsCode}`;

  const cached = await cacheGet(redis, cacheKey);
  if (cached !== null) {
    try {
      return JSON.parse(cached) as TradeDataResponse;
    } catch {
      // Fall through
    }
  }

  const url =
    `${COMTRADE_BASE}/${CLASSIFICATION}/${FREQUENCY}/HS` +
    `?reporterCode=${REPORTER_POLAND}` +
    `&partnerCode=${encodeURIComponent(partnerCode)}` +
    `&cmdCode=${encodeURIComponent(hsCode)}` +
    `&flowCode=${FLOW_IMPORTS}` +
    `&maxRecords=12`;

  const response = await fetchWithRetry(url, apiKey);

  if (response.status === 404) {
    const result: TradeDataResponse = { found: false };
    await cacheSet(redis, cacheKey, JSON.stringify(result));
    return result;
  }

  if (!response.ok) {
    throw new Error(`Comtrade API error: HTTP ${response.status}`);
  }

  const raw: unknown = await response.json();
  const parsed = ComtradeResponseSchema.safeParse(raw);

  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues, hsCode, partnerCode }, "Unexpected Comtrade response schema");
    throw new Error("Invalid response from UN Comtrade API");
  }

  if (parsed.data.error !== undefined) {
    logger.warn({ error: parsed.data.error, hsCode }, "Comtrade API returned error");
    throw new Error(`Comtrade error: ${parsed.data.error}`);
  }

  const dataRows = parsed.data.data ?? [];

  if (dataRows.length === 0) {
    const result: TradeDataResponse = { found: false };
    await cacheSet(redis, cacheKey, JSON.stringify(result));
    return result;
  }

  const trend = calculateTrend(dataRows);

  // Use the most recent record for the primary response
  const sortedRows = [...dataRows].sort((a, b) => {
    const yearA = a.refYear ?? Number(a.period ?? 0);
    const yearB = b.refYear ?? Number(b.period ?? 0);
    return yearB - yearA;
  });

  const latest = sortedRows[0];
  if (latest === undefined) {
    return { found: false };
  }

  const year = latest.refYear ?? Number(latest.period ?? 0);

  const result: TradeDataResponse = {
    found: true,
    data: {
      hsCode: latest.cmdCode ?? hsCode,
      description: latest.cmdDesc ?? "",
      year,
      importValueUSD: latest.primaryValue ?? 0,
      importQuantity: latest.qty ?? null,
      quantityUnit: latest.qtyUnitAbbr ?? null,
      partnerCountry: latest.partnerDesc ?? partnerCode,
      trend,
    },
  };

  await cacheSet(redis, cacheKey, JSON.stringify(result));

  return result;
}

/**
 * Disconnect Redis client — call during graceful shutdown.
 */
export async function closeComtradeRedis(): Promise<void> {
  if (redisClient !== null) {
    try {
      await redisClient.quit();
    } catch {
      // Best-effort
    }
    redisClient = null;
  }
}
