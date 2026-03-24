// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — analytics-service
// Eurostat REST API — EU trade and GDP statistics
//
// No authentication required — fully open API
// Datasets used:
//   DS-045409 : EU trade by product and partner country
//   nama_10_gdp : GDP and main aggregates
// Cache TTL: 30 days — statistical data updates infrequently
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, type RedisClientType } from "redis";
import { createLogger } from "@ecompilot/shared-observability";
import { z } from "zod";

const logger = createLogger({ service: "analytics-service", module: "eurostat" });

// ─── Constants ────────────────────────────────────────────────────────────────

const EUROSTAT_BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const CACHE_PREFIX = "eurostat:";
const MAX_RETRIES = 1;

// ─── Eurostat JSON-stat response schema ───────────────────────────────────────
// Eurostat returns JSON-stat 2.0 format. We parse only the fields we need.

const EurostatDimensionCategorySchema = z.object({
  index: z.record(z.string(), z.number()),
  label: z.record(z.string(), z.string()),
});

const EurostatDimensionSchema = z.object({
  label: z.string(),
  category: EurostatDimensionCategorySchema,
});

const EurostatResponseSchema = z.object({
  id: z.array(z.string()),
  size: z.array(z.number()),
  dimension: z.record(z.string(), EurostatDimensionSchema),
  value: z.record(z.string(), z.number().nullable()),
  label: z.string().optional(),
  updated: z.string().optional(),
  status: z.union([
    z.record(z.string(), z.string()),
    z.string(),
  ]).optional(),
});

// ─── Error response schema ────────────────────────────────────────────────────

const EurostatErrorSchema = z.object({
  error: z.object({
    status: z.number(),
    label: z.string(),
  }),
});

// ─── Public types ─────────────────────────────────────────────────────────────

export interface EurostatDataPoint {
  readonly year: string;
  readonly value: number;
  readonly unit: string;
}

export interface EurostatTradeResponse {
  readonly data: readonly EurostatDataPoint[];
}

// ─── Redis client (lazy singleton) ────────────────────────────────────────────

let redisClient: RedisClientType | null = null;

function getRedis(redisUrl: string): RedisClientType {
  if (redisClient !== null) return redisClient;

  redisClient = createClient({ url: redisUrl }) as RedisClientType;
  redisClient.on("error", (err: unknown) => {
    logger.error({ err }, "Redis client error (eurostat)");
  });

  redisClient.connect().catch((err: unknown) => {
    logger.warn({ err }, "Redis connect failed — eurostat cache disabled");
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
    logger.warn({ err, key }, "Failed to write eurostat cache entry");
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
      logger.warn({ status: response.status, attempt }, "Eurostat 5xx — retrying");
      return fetchWithRetry(url, attempt + 1);
    }

    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ─── JSON-stat parser ─────────────────────────────────────────────────────────
//
// Eurostat JSON-stat encodes values as a flat object keyed by a linear index.
// We need to reconstruct the time dimension and match values.
//
// Response structure:
//   id:        ["freq", "partner", "product", "geo", "time"]
//   size:      [1, 1, 1, 1, N]
//   dimension: { time: { category: { index: { "2020": 0, "2021": 1, ... } } } }
//   value:     { "0": 123.4, "1": 456.7, ... }

function parseJsonStat(
  parsed: z.infer<typeof EurostatResponseSchema>,
  unitLabel: string,
): EurostatDataPoint[] {
  const timeDimKey = parsed.id.find((id) =>
    id.toLowerCase() === "time" || id.toLowerCase() === "year",
  );

  if (timeDimKey === undefined) {
    logger.warn({ dimensions: parsed.id }, "No time dimension found in Eurostat response");
    return [];
  }

  const timeDim = parsed.dimension[timeDimKey];
  if (timeDim === undefined) return [];

  const timeIndex = timeDim.category.index; // { "2020": 0, "2021": 1, ... }
  const timeLabels = timeDim.category.label; // { "2020": "2020", "2021": "2021", ... }

  // Find the position of the time dimension in the `id` array
  const timeDimPosition = parsed.id.indexOf(timeDimKey);
  if (timeDimPosition === -1) return [];

  // Stride = product of all sizes after the time dimension
  const stride = parsed.size.slice(timeDimPosition + 1).reduce((a, b) => a * b, 1);

  const results: EurostatDataPoint[] = [];

  for (const [timeCode, timePos] of Object.entries(timeIndex)) {
    const flatIndex = timePos * stride;
    const rawValue = parsed.value[String(flatIndex)];

    if (rawValue === undefined || rawValue === null) continue;

    const yearLabel = timeLabels[timeCode] ?? timeCode;

    results.push({
      year: yearLabel,
      value: rawValue,
      unit: unitLabel,
    });
  }

  // Sort chronologically
  results.sort((a, b) => a.year.localeCompare(b.year));

  return results;
}

// ─── Unit label extractor ─────────────────────────────────────────────────────

function extractUnitLabel(parsed: z.infer<typeof EurostatResponseSchema>): string {
  const unitDim = parsed.dimension["unit"];
  if (unitDim === undefined) return "value";

  const labels = unitDim.category.label;
  const firstKey = Object.keys(labels)[0];
  return (firstKey !== undefined ? labels[firstKey] : undefined) ?? "value";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch EU trade data from Eurostat for a given product code and partner country.
 *
 * Uses dataset DS-045409 (EU trade by product and partner).
 * geo is fixed to PL (Poland).
 */
export async function getEuTradeData(
  productCode: string,
  partnerCountry: string,
  redisUrl: string,
): Promise<EurostatTradeResponse> {
  const redis = getRedis(redisUrl);
  const cacheKey = `${CACHE_PREFIX}trade:PL:${partnerCountry}:${productCode}`;

  const cached = await cacheGet(redis, cacheKey);
  if (cached !== null) {
    try {
      return JSON.parse(cached) as EurostatTradeResponse;
    } catch {
      // Fall through
    }
  }

  const url =
    `${EUROSTAT_BASE}/DS-045409` +
    `?geo=PL` +
    `&partner=${encodeURIComponent(partnerCountry)}` +
    `&product=${encodeURIComponent(productCode)}` +
    `&format=JSON` +
    `&lang=EN`;

  const response = await fetchWithRetry(url);

  if (response.status === 404) {
    const result: EurostatTradeResponse = { data: [] };
    await cacheSet(redis, cacheKey, JSON.stringify(result));
    return result;
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");

    // Attempt to parse Eurostat error response
    try {
      const errParsed = EurostatErrorSchema.safeParse(JSON.parse(bodyText));
      if (errParsed.success) {
        throw new Error(`Eurostat error ${errParsed.data.error.status}: ${errParsed.data.error.label}`);
      }
    } catch (parseErr: unknown) {
      if (parseErr instanceof Error && parseErr.message.startsWith("Eurostat error")) {
        throw parseErr;
      }
    }

    throw new Error(`Eurostat API error: HTTP ${response.status}`);
  }

  const raw: unknown = await response.json();
  const parsed = EurostatResponseSchema.safeParse(raw);

  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues, productCode, partnerCountry }, "Unexpected Eurostat schema");
    throw new Error("Invalid response from Eurostat API");
  }

  const unitLabel = extractUnitLabel(parsed.data);
  const dataPoints = parseJsonStat(parsed.data, unitLabel);

  const result: EurostatTradeResponse = { data: dataPoints };

  await cacheSet(redis, cacheKey, JSON.stringify(result));

  return result;
}

/**
 * Fetch GDP data from Eurostat for Poland.
 * Uses dataset nama_10_gdp.
 */
export async function getGdpData(
  unit: string,
  redisUrl: string,
): Promise<EurostatTradeResponse> {
  const redis = getRedis(redisUrl);
  const cacheKey = `${CACHE_PREFIX}gdp:PL:${unit}`;

  const cached = await cacheGet(redis, cacheKey);
  if (cached !== null) {
    try {
      return JSON.parse(cached) as EurostatTradeResponse;
    } catch {
      // Fall through
    }
  }

  const url =
    `${EUROSTAT_BASE}/nama_10_gdp` +
    `?geo=PL` +
    `&unit=${encodeURIComponent(unit)}` +
    `&na_item=B1GQ` + // Gross domestic product at market prices
    `&format=JSON` +
    `&lang=EN`;

  const response = await fetchWithRetry(url);

  if (response.status === 404) {
    const result: EurostatTradeResponse = { data: [] };
    await cacheSet(redis, cacheKey, JSON.stringify(result));
    return result;
  }

  if (!response.ok) {
    throw new Error(`Eurostat GDP API error: HTTP ${response.status}`);
  }

  const raw: unknown = await response.json();
  const parsed = EurostatResponseSchema.safeParse(raw);

  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "Unexpected Eurostat GDP schema");
    throw new Error("Invalid response from Eurostat GDP API");
  }

  const unitLabel = extractUnitLabel(parsed.data);
  const dataPoints = parseJsonStat(parsed.data, unitLabel);

  const result: EurostatTradeResponse = { data: dataPoints };

  await cacheSet(redis, cacheKey, JSON.stringify(result));

  return result;
}

/**
 * Disconnect Redis client — call during graceful shutdown.
 */
export async function closeEurostatRedis(): Promise<void> {
  if (redisClient !== null) {
    try {
      await redisClient.quit();
    } catch {
      // Best-effort
    }
    redisClient = null;
  }
}
