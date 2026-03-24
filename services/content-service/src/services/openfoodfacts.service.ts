// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — content-service
// Open Food Facts integration — 4 M+ food products
// Docs: https://openfoodfacts.github.io/openfoodfacts-server/api/
// ─────────────────────────────────────────────────────────────────────────────

import { getRedisClient } from "./redis.client.js";
import { createLogger } from "@ecompilot/shared-observability";

const logger = createLogger({ service: "content-service" });

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const OFF_BASE_URL = "https://world.openfoodfacts.org/api/v2/product";
/** 7 days — food data is relatively stable */
const CACHE_TTL_SECONDS = 7 * 24 * 3_600;
/** Required by Open Food Facts ToS */
const USER_AGENT = "EcomPilot/1.0 - contact@ecompilot.pl";
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RETRIES = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Types — OFF raw API response (subset)
// ─────────────────────────────────────────────────────────────────────────────

interface OffNutriments {
  readonly "energy-kcal_100g"?: number;
  readonly "energy_100g"?: number;
  readonly fat_100g?: number;
  readonly carbohydrates_100g?: number;
  readonly proteins_100g?: number;
  readonly salt_100g?: number;
  readonly sugars_100g?: number;
  readonly fiber_100g?: number;
}

interface OffProductRaw {
  readonly product_name?: string;
  readonly product_name_pl?: string;
  readonly brands?: string;
  readonly categories?: string;
  readonly categories_tags?: ReadonlyArray<string>;
  readonly ingredients_text?: string;
  readonly ingredients_text_pl?: string;
  readonly nutriscore_grade?: string;
  readonly nutrition_grade_fr?: string;
  readonly allergens?: string;
  readonly allergens_tags?: ReadonlyArray<string>;
  readonly image_front_url?: string;
  readonly image_url?: string;
  readonly selected_images?: {
    readonly front?: {
      readonly display?: { readonly pl?: string; readonly en?: string };
    };
  };
  readonly nutriments?: OffNutriments;
}

interface OffApiResponse {
  readonly status?: number;
  readonly status_verbose?: string;
  readonly product?: OffProductRaw;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface FoodNutriments {
  readonly energyKcal: number | null;
  readonly fat: number | null;
  readonly carbs: number | null;
  readonly protein: number | null;
  readonly salt: number | null;
  readonly sugars: number | null;
  readonly fiber: number | null;
}

export interface FoodProduct {
  readonly name: string;
  readonly brand: string;
  readonly categories: string;
  readonly ingredients: string;
  readonly nutriScore: string | null;
  readonly allergens: string;
  readonly image: string | null;
  readonly nutriments: FoodNutriments;
  readonly source: "openfoodfacts";
}

export type FoodResult =
  | { readonly found: true; readonly product: FoodProduct }
  | { readonly found: false; readonly error?: string };

// ─────────────────────────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────────────────────────

function cacheKey(barcode: string): string {
  return `off:product:${barcode}`;
}

async function getCached(key: string): Promise<FoodResult | null> {
  try {
    const redis = getRedisClient();
    const raw = await redis.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as FoodResult;
  } catch {
    return null;
  }
}

async function setCache(key: string, value: FoodResult): Promise<void> {
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

function safeNum(v: number | undefined): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}

function parseOffResponse(raw: OffApiResponse): FoodResult {
  if (raw.status !== 1 || raw.product === undefined) {
    return { found: false, error: raw.status_verbose ?? "Product not found" };
  }

  const p = raw.product;

  // Prefer Polish product name, fall back to generic
  const name =
    (p.product_name_pl !== "" ? p.product_name_pl : undefined) ??
    p.product_name ??
    "";

  if (name === "") {
    return { found: false, error: "Product has no name in Open Food Facts" };
  }

  const brand = p.brands ?? "";
  const categories = p.categories ?? "";

  const ingredients =
    (p.ingredients_text_pl !== "" ? p.ingredients_text_pl : undefined) ??
    p.ingredients_text ??
    "";

  const nutriScore =
    p.nutriscore_grade ??
    p.nutrition_grade_fr ??
    null;

  // Allergens — strip "en:" tag prefixes
  const allergenTags = p.allergens_tags ?? [];
  const allergens =
    allergenTags.length > 0
      ? allergenTags.map((t) => t.replace(/^[a-z]{2}:/, "")).join(", ")
      : (p.allergens ?? "");

  // Image — prefer front display image in Polish, fall back to generic
  const image =
    p.selected_images?.front?.display?.pl ??
    p.selected_images?.front?.display?.en ??
    p.image_front_url ??
    p.image_url ??
    null;

  const nm = p.nutriments ?? {};
  const nutriments: FoodNutriments = {
    energyKcal: safeNum(nm["energy-kcal_100g"]) ?? safeNum(nm["energy_100g"] !== undefined ? nm["energy_100g"]! / 4.184 : undefined),
    fat: safeNum(nm.fat_100g),
    carbs: safeNum(nm.carbohydrates_100g),
    protein: safeNum(nm.proteins_100g),
    salt: safeNum(nm.salt_100g),
    sugars: safeNum(nm.sugars_100g),
    fiber: safeNum(nm.fiber_100g),
  };

  return {
    found: true,
    product: {
      name,
      brand,
      categories,
      ingredients,
      nutriScore: nutriScore !== "" ? nutriScore : null,
      allergens,
      image: image !== "" ? image : null,
      nutriments,
      source: "openfoodfacts",
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
      headers: {
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
      },
    });
    clearTimeout(timer);

    if ((response.status >= 500 || response.status === 429) && attempt < MAX_RETRIES) {
      logger.warn(
        { status: response.status, attempt, url },
        "Open Food Facts request failed, retrying",
      );
      await new Promise<void>((resolve) => { setTimeout(resolve, 1_000 * (attempt + 1)); });
      return fetchWithRetry(url, attempt + 1);
    }

    return response;
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    if (isTimeout && attempt < MAX_RETRIES) {
      logger.warn({ attempt, url }, "Open Food Facts request timed out, retrying");
      return fetchWithRetry(url, attempt + 1);
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up a food product by barcode in Open Food Facts.
 * Results are cached in Redis for 7 days.
 */
export async function lookupFoodProduct(barcode: string): Promise<FoodResult> {
  const key = cacheKey(barcode);

  const cached = await getCached(key);
  if (cached !== null) return cached;

  const url = `${OFF_BASE_URL}/${encodeURIComponent(barcode)}.json`;

  try {
    const response = await fetchWithRetry(url);

    if (response.status === 404) {
      const result: FoodResult = { found: false, error: "Product not found" };
      await setCache(key, result);
      return result;
    }

    if (!response.ok) {
      logger.warn(
        { status: response.status, barcode },
        "Open Food Facts API returned non-OK status",
      );
      return {
        found: false,
        error: `Open Food Facts API error: HTTP ${String(response.status)}`,
      };
    }

    const json: unknown = await response.json();
    const result = parseOffResponse(json as OffApiResponse);
    await setCache(key, result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, barcode }, "Open Food Facts API call failed");
    return { found: false, error: message };
  }
}
