// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — content-service
// Icecat Open Catalog integration — 18 M+ product datasheets
// Docs: https://icecat.biz/en/info/api.html
// ─────────────────────────────────────────────────────────────────────────────

import { env } from "../config/env.js";
import { getRedisClient } from "./redis.client.js";
import { createLogger } from "@ecompilot/shared-observability";

const logger = createLogger({ service: "content-service" });

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ICECAT_BASE_URL = "https://live.icecat.biz/api/";
/** 24 hours — product datasheets rarely change */
const CACHE_TTL_SECONDS = 86_400;
/** 8 seconds per external call */
const REQUEST_TIMEOUT_MS = 8_000;
/** One retry on timeout / 5xx */
const MAX_RETRIES = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Types — Icecat raw API response (subset we care about)
// ─────────────────────────────────────────────────────────────────────────────

interface IcecatFeatureGroup {
  readonly FeatureGroup: {
    readonly Name: { readonly Value: string };
  };
  readonly Features?: ReadonlyArray<{
    readonly Feature: {
      readonly Name: { readonly Value: string };
    };
    readonly LocalValue?: string;
    readonly Value?: string;
  }>;
}

interface IcecatGalleryImage {
  readonly LowPic?: string;
  readonly HighPic?: string;
  readonly ThumbPic?: string;
}

interface IcecatProductData {
  readonly Title?: string;
  readonly ShortDesc?: string;
  readonly LongDesc?: string;
  readonly Brand?: string;
  readonly BrandInfo?: { readonly BrandName?: string };
  readonly Category?: {
    readonly Name?: { readonly Value?: string };
  };
  readonly FeaturesGroups?: ReadonlyArray<IcecatFeatureGroup>;
  readonly Gallery?: ReadonlyArray<IcecatGalleryImage>;
  readonly LowPic?: string;
  readonly HighPic?: string;
}

interface IcecatApiResponse {
  readonly msg?: string;
  readonly data?: IcecatProductData;
  // The flat structure is used when the response is not nested under "data"
  readonly Title?: string;
  readonly ShortDesc?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface IcecatSpec {
  readonly name: string;
  readonly value: string;
}

export interface IcecatProduct {
  readonly title: string;
  readonly description: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly brand: string;
  readonly category: string;
  readonly specs: ReadonlyArray<IcecatSpec>;
  readonly images: ReadonlyArray<string>;
  readonly source: "icecat";
}

export type IcecatResult =
  | { readonly found: true; readonly product: IcecatProduct }
  | { readonly found: false; readonly error?: string };

// ─────────────────────────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────────────────────────

function cacheKey(ean: string, language: string): string {
  return `icecat:product:${language}:${ean}`;
}

async function getCached(key: string): Promise<IcecatResult | null> {
  try {
    const redis = getRedisClient();
    const raw = await redis.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as IcecatResult;
  } catch {
    return null;
  }
}

async function setCache(key: string, value: IcecatResult): Promise<void> {
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

function parseIcecatResponse(raw: IcecatApiResponse): IcecatResult {
  // Icecat returns { msg: "too many requests" } or similar on error
  if (typeof raw.msg === "string" && raw.msg.toLowerCase() !== "ok" && raw.msg.toLowerCase() !== "success") {
    return { found: false, error: raw.msg };
  }

  // Product payload may live under raw.data or directly on raw
  const pd: IcecatProductData = (raw.data ?? raw) as IcecatProductData;

  const title = pd.Title ?? "";
  if (title === "") {
    return { found: false, error: "Product not found in Icecat" };
  }

  const shortDescription = pd.ShortDesc ?? "";
  const longDescription = pd.LongDesc ?? "";
  const description = longDescription !== "" ? longDescription : shortDescription;

  const brand =
    pd.BrandInfo?.BrandName ??
    pd.Brand ??
    "";

  const category = pd.Category?.Name?.Value ?? "";

  // Flatten spec features from all feature groups
  const specs: IcecatSpec[] = [];
  if (Array.isArray(pd.FeaturesGroups)) {
    for (const group of pd.FeaturesGroups) {
      if (!Array.isArray(group.Features)) continue;
      for (const feat of group.Features) {
        const name = feat.Feature?.Name?.Value ?? "";
        const value = feat.LocalValue ?? feat.Value ?? "";
        if (name !== "" && value !== "") {
          specs.push({ name, value });
        }
      }
    }
  }

  // Collect images — prefer high-res, deduplicate
  const imageSet = new Set<string>();
  if (typeof pd.HighPic === "string" && pd.HighPic !== "") imageSet.add(pd.HighPic);
  if (typeof pd.LowPic === "string" && pd.LowPic !== "") imageSet.add(pd.LowPic);
  if (Array.isArray(pd.Gallery)) {
    for (const img of pd.Gallery) {
      if (typeof img.HighPic === "string" && img.HighPic !== "") imageSet.add(img.HighPic);
      else if (typeof img.LowPic === "string" && img.LowPic !== "") imageSet.add(img.LowPic);
      else if (typeof img.ThumbPic === "string" && img.ThumbPic !== "") imageSet.add(img.ThumbPic);
    }
  }

  return {
    found: true,
    product: {
      title,
      description,
      shortDescription,
      longDescription,
      brand,
      category,
      specs,
      images: [...imageSet],
      source: "icecat",
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
        "Icecat request failed, retrying",
      );
      await new Promise<void>((resolve) => { setTimeout(resolve, 1_000 * (attempt + 1)); });
      return fetchWithRetry(url, attempt + 1);
    }

    return response;
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    if (isTimeout && attempt < MAX_RETRIES) {
      logger.warn({ attempt, url }, "Icecat request timed out, retrying");
      return fetchWithRetry(url, attempt + 1);
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up a product by EAN/GTIN in the Icecat Open Catalog.
 * Results are cached in Redis for 24 hours.
 */
export async function lookupProductByEan(
  ean: string,
  language = "pl",
): Promise<IcecatResult> {
  const key = cacheKey(ean, language);

  const cached = await getCached(key);
  if (cached !== null) return cached;

  const username = env.ICECAT_USERNAME;
  const url =
    `${ICECAT_BASE_URL}?UserName=${encodeURIComponent(username)}&Language=${encodeURIComponent(language)}&GTIN=${encodeURIComponent(ean)}&output=productxml`;

  try {
    const response = await fetchWithRetry(url);

    if (response.status === 404) {
      const result: IcecatResult = { found: false, error: "Product not found" };
      await setCache(key, result);
      return result;
    }

    if (!response.ok) {
      logger.warn(
        { status: response.status, ean },
        "Icecat API returned non-OK status",
      );
      return { found: false, error: `Icecat API error: HTTP ${String(response.status)}` };
    }

    const json: unknown = await response.json();
    const result = parseIcecatResponse(json as IcecatApiResponse);
    await setCache(key, result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, ean }, "Icecat API call failed");
    return { found: false, error: message };
  }
}
