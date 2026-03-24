// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — scraper-service
// Product enricher — orchestrates all scrapers with caching and semaphore
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { createLogger } from "@ecompilot/shared-observability";
import { searchGoogle } from "./google-search.js";
import { scrapeAllegroProduct } from "./allegro-scraper.js";
import { searchImages } from "./google-images.js";
import { env } from "../config/env.js";

const logger = createLogger({ service: "scraper-service" });

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EnrichedProductSpec {
  readonly name: string;
  readonly value: string;
}

export type ProductSource = "allegro" | "google";

export interface EnrichedProduct {
  readonly title: string;
  readonly description: string;
  readonly price: number | null;
  readonly currency: string | null;
  readonly images: string[];
  readonly specs: EnrichedProductSpec[];
  readonly category: string | null;
  readonly seller: string | null;
  readonly rating: number | null;
  readonly source: ProductSource;
  readonly url: string | null;
}

interface GoogleResult {
  title: string;
  url: string;
  snippet: string;
}

interface UserIntegration {
  service: string;
  isActive: boolean | null;
  maskedKey: string;
  metadata: Record<string, unknown> | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Redis cache (lazy-initialised singleton — avoids per-call connection churn)
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 7 * 24 * 3_600; // 7 days

// Module-level singleton — created on first cache access, reused thereafter
let _redis: import("ioredis").default | null = null;
let _redisConnecting = false;

async function getRedisClient(): Promise<import("ioredis").default | null> {
  if (_redis !== null) return _redis;
  if (_redisConnecting) return null;

  _redisConnecting = true;
  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => {
        if (times > 3) return null; // Give up after 3 retries
        return Math.min(times * 300, 1_000);
      },
    });
    await client.connect();
    _redis = client;
    logger.info("Redis client connected (product-enricher cache)");
    return _redis;
  } catch (err) {
    logger.warn({ err }, "Redis unavailable — scrape caching disabled");
    return null;
  } finally {
    _redisConnecting = false;
  }
}

function buildCacheKey(query: string): string {
  const hash = createHash("sha256").update(query.toLowerCase().trim()).digest("hex").slice(0, 16);
  return `scraper:product:${hash}`;
}

async function getFromCache(key: string): Promise<EnrichedProduct | null> {
  try {
    const redis = await getRedisClient();
    if (redis === null) return null;
    const raw = await redis.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as EnrichedProduct;
  } catch {
    // Redis unavailable — proceed without cache
    return null;
  }
}

async function setInCache(key: string, value: EnrichedProduct): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (redis === null) return;
    await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(value));
  } catch {
    // Non-fatal — scraping still succeeds without caching
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Semaphore — limits concurrent scrape operations
// ─────────────────────────────────────────────────────────────────────────────

let _activeScrapes = 0;

async function acquireSemaphore(): Promise<boolean> {
  if (_activeScrapes >= env.MAX_CONCURRENT_SCRAPES) {
    logger.warn(
      { active: _activeScrapes, max: env.MAX_CONCURRENT_SCRAPES },
      "Semaphore limit reached — rejecting scrape request",
    );
    return false;
  }
  _activeScrapes++;
  return true;
}

function releaseSemaphore(): void {
  _activeScrapes = Math.max(0, _activeScrapes - 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Allegro URL detection
// ─────────────────────────────────────────────────────────────────────────────

function isAllegroProductUrl(url: string): boolean {
  return url.includes("allegro.pl/oferta/") || url.includes("allegro.pl/listing/");
}

function extractAllegroUrl(results: ReadonlyArray<{ url: string }>): string | null {
  for (const result of results) {
    if (isAllegroProductUrl(result.url)) {
      return result.url;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Snippet-based product extraction (Google fallback)
// ─────────────────────────────────────────────────────────────────────────────

interface SnippetProductData {
  title: string;
  description: string;
  url: string | null;
}

function extractFromSnippets(
  results: ReadonlyArray<{ title: string; url: string; snippet: string }>,
): SnippetProductData | null {
  const best = results[0];
  if (best === undefined) return null;

  const description = results
    .slice(0, 3)
    .map((r) => r.snippet)
    .filter((s) => s.length > 20)
    .join(" ")
    .slice(0, 1000);

  return {
    title: best.title,
    description,
    url: best.url,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Polite inter-step delay
// ─────────────────────────────────────────────────────────────────────────────

async function stepDelay(): Promise<void> {
  const delay = env.SCRAPE_DELAY_MS + Math.floor(Math.random() * 1_000);
  await new Promise<void>((resolve) => setTimeout(resolve, delay));
}

// ─────────────────────────────────────────────────────────────────────────────
// SerpAPI client
// ─────────────────────────────────────────────────────────────────────────────

async function searchWithSerpApi(query: string, apiKey: string): Promise<GoogleResult[]> {
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&gl=pl&hl=pl`;
  const res = await fetch(url);
  const data = (await res.json()) as {
    organic_results?: Array<{ title: string; link: string; snippet: string }>;
  };
  return (
    data.organic_results?.map((r) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
    })) ?? []
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch user integrations from auth-service (internal call)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchUserIntegrations(userId: string): Promise<UserIntegration[]> {
  const authServiceUrl = process.env["AUTH_SERVICE_URL"] ?? "http://auth-service:3000";

  try {
    const res = await fetch(`${authServiceUrl}/api/v1/auth/integrations`, {
      headers: {
        "x-internal-service": "scraper-service",
        "x-user-id": userId,
      },
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      success: boolean;
      data: { integrations: UserIntegration[] };
    };

    return data.data?.integrations ?? [];
  } catch (err) {
    logger.warn({ err, userId }, "Failed to fetch user integrations from auth-service");
    return [];
  }
}

function findActiveIntegration(
  integrations: UserIntegration[],
  service: string,
): UserIntegration | null {
  return integrations.find((i) => i.service === service && i.isActive) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Allegro REST API search using OAuth token
// ─────────────────────────────────────────────────────────────────────────────

interface AllegroOffer {
  id: string;
  name: string;
  sellingMode?: { price?: { amount?: string; currency?: string } };
  images?: Array<{ url: string }>;
  category?: { name: string };
  seller?: { login: string };
}

async function searchAllegroApi(
  query: string,
  accessToken: string,
): Promise<EnrichedProduct | null> {
  try {
    const searchUrl = `https://api.allegro.pl/offers/listing?phrase=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.allegro.public.v1+json",
      },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      items?: { promoted?: AllegroOffer[]; regular?: AllegroOffer[] };
    };

    const items = [
      ...(data.items?.promoted ?? []),
      ...(data.items?.regular ?? []),
    ];

    const first = items[0];
    if (!first) return null;

    const price = first.sellingMode?.price?.amount
      ? parseFloat(first.sellingMode.price.amount)
      : null;
    const currency = first.sellingMode?.price?.currency ?? null;
    const images = first.images?.map((img) => img.url) ?? [];

    return {
      title: first.name,
      description: "",
      price,
      currency,
      images,
      specs: [],
      category: first.category?.name ?? null,
      seller: first.seller?.login ?? null,
      rating: null,
      source: "allegro" as const,
      url: `https://allegro.pl/oferta/${first.id}`,
    };
  } catch (err) {
    logger.warn({ err, query }, "Allegro API search failed");
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enrich product data using a waterfall of scraping strategies.
 *
 * When userId is provided, user-owned API keys are preferred:
 * - SerpAPI / Google Search key  →  used instead of Playwright Google search
 * - Allegro OAuth access_token   →  used instead of scraping Allegro HTML
 * Fallback: Playwright (original behaviour).
 *
 * 1. Check Redis cache
 * 2a. [userId + serpapi/google_search] SerpAPI search → Allegro URL → scrape/API
 * 2b. [userId + allegro token] Allegro REST API search
 * 2c. Playwright Google search → scrape Allegro product page
 * 3. If no Allegro: Google organic fallback → snippets
 * 4. Google Images
 * 5. Persist result in cache (7 days TTL)
 *
 * Never throws — returns null on any failure.
 *
 * @param query  - EAN barcode or product name string
 * @param userId - optional authenticated user ID for personalised key lookup
 */
export async function enrichProduct(
  query: string,
  userId?: string,
): Promise<EnrichedProduct | null> {
  const cacheKey = buildCacheKey(query);

  // ── Step 1: Check cache ──────────────────────────────────────────────────
  const cached = await getFromCache(cacheKey);
  if (cached !== null) {
    logger.info({ query, cacheKey }, "Cache hit — returning cached product data");
    return cached;
  }

  // ── Acquire semaphore ────────────────────────────────────────────────────
  const acquired = await acquireSemaphore();
  if (!acquired) {
    return null;
  }

  try {
    // ── Optionally load user integrations ───────────────────────────────
    let serpApiKey: string | null = null;
    let allegroAccessToken: string | null = null;

    if (userId !== undefined && userId.length > 0) {
      const integrations = await fetchUserIntegrations(userId);

      const serpInt = findActiveIntegration(integrations, "serpapi")
        ?? findActiveIntegration(integrations, "google_search");

      if (serpInt) {
        // maskedKey is not the real key — the auth-service must expose
        // the real key via an internal endpoint. For now, the integration
        // metadata may carry it, or we use a dedicated decrypt endpoint.
        // We store the service presence so the scraper can route correctly.
        serpApiKey = serpInt.metadata?.["apiKey"] as string | null ?? null;
      }

      const allegroInt = findActiveIntegration(integrations, "allegro");
      if (allegroInt) {
        allegroAccessToken = allegroInt.metadata?.["accessToken"] as string | null ?? null;
      }
    }

    let result: EnrichedProduct | null = null;

    // ── Step 2a: Allegro REST API (user has OAuth token) ─────────────────
    if (allegroAccessToken !== null && allegroAccessToken.length > 0) {
      logger.info({ query, userId }, "Using Allegro REST API (user OAuth token)");
      result = await searchAllegroApi(query, allegroAccessToken);
    }

    // ── Step 2b: SerpAPI search → Allegro URL → scrape ───────────────────
    if (result === null && serpApiKey !== null && serpApiKey.length > 0) {
      logger.info({ query, userId }, "Using SerpAPI for Google search");

      const serpResults = await searchWithSerpApi(`site:allegro.pl ${query}`, serpApiKey);
      const allegroUrl = extractAllegroUrl(serpResults);

      if (allegroUrl !== null) {
        logger.info({ query, allegroUrl }, "SerpAPI: found Allegro URL — scraping product page");
        const allegroProduct = await scrapeAllegroProduct(allegroUrl);

        if (allegroProduct !== null && allegroProduct.title !== "") {
          let images = [...allegroProduct.images];
          if (images.length < 3) {
            await stepDelay();
            logger.debug({ query }, "Allegro images sparse — fetching from Google Images");
            const googleImages = await searchImages(allegroProduct.title, 5);
            images = [...images, ...googleImages].slice(0, 10);
          }

          result = {
            title: allegroProduct.title,
            description: allegroProduct.description,
            price: allegroProduct.price,
            currency: allegroProduct.currency,
            images,
            specs: allegroProduct.specs,
            category: allegroProduct.category !== "" ? allegroProduct.category : null,
            seller: allegroProduct.seller !== "" ? allegroProduct.seller : null,
            rating: allegroProduct.rating,
            source: "allegro" as const,
            url: allegroProduct.url,
          };
        }
      }

      // SerpAPI organic fallback (no Allegro URL)
      if (result === null) {
        const buyResults = await searchWithSerpApi(`${query} buy kup`, serpApiKey);
        const snippetData = extractFromSnippets(buyResults);

        if (snippetData !== null) {
          await stepDelay();
          const imageResults = await searchImages(query, 5);
          result = {
            title: snippetData.title,
            description: snippetData.description,
            price: null,
            currency: null,
            images: imageResults,
            specs: [],
            category: null,
            seller: null,
            rating: null,
            source: "google" as const,
            url: snippetData.url,
          };
        }
      }
    }

    // ── Step 2c: Playwright Google search → Allegro (original path) ──────
    if (result === null) {
      logger.info({ query }, "Searching Google for Allegro product (Playwright)");
      const allegroSearchResults = await searchGoogle(`site:allegro.pl ${query}`);

      await stepDelay();

      const allegroUrl = extractAllegroUrl(allegroSearchResults);

      if (allegroUrl !== null) {
        logger.info({ query, allegroUrl }, "Found Allegro URL — scraping product page");

        const allegroProduct = await scrapeAllegroProduct(allegroUrl);

        if (allegroProduct !== null && allegroProduct.title !== "") {
          let images = [...allegroProduct.images];

          if (images.length < 3) {
            await stepDelay();
            logger.debug({ query }, "Allegro images sparse — fetching from Google Images");
            const googleImages = await searchImages(allegroProduct.title, 5);
            images = [...images, ...googleImages].slice(0, 10);
          }

          result = {
            title: allegroProduct.title,
            description: allegroProduct.description,
            price: allegroProduct.price,
            currency: allegroProduct.currency,
            images,
            specs: allegroProduct.specs,
            category: allegroProduct.category !== "" ? allegroProduct.category : null,
            seller: allegroProduct.seller !== "" ? allegroProduct.seller : null,
            rating: allegroProduct.rating,
            source: "allegro" as const,
            url: allegroProduct.url,
          };
        }
      }
    }

    // ── Step 3: Google organic fallback (no Allegro, or Allegro scrape failed)
    if (result === null) {
      logger.info({ query }, "No Allegro data — falling back to Google organic search");

      await stepDelay();
      const buyResults = await searchGoogle(`${query} buy kup`);

      const snippetData = extractFromSnippets(buyResults);

      if (snippetData !== null) {
        // ── Step 4: Google Images for the product ────────────────────────
        await stepDelay();
        logger.debug({ query }, "Fetching images from Google Images");
        const imageResults = await searchImages(query, 5);

        result = {
          title: snippetData.title,
          description: snippetData.description,
          price: null,
          currency: null,
          images: imageResults,
          specs: [],
          category: null,
          seller: null,
          rating: null,
          source: "google" as const,
          url: snippetData.url,
        };
      } else {
        // Even the Google fallback had no results — only try images
        const imageResults = await searchImages(query, 5);
        if (imageResults.length > 0) {
          result = {
            title: query,
            description: "",
            price: null,
            currency: null,
            images: imageResults,
            specs: [],
            category: null,
            seller: null,
            rating: null,
            source: "google" as const,
            url: null,
          };
        }
      }
    }

    // ── Step 5: Persist to cache ─────────────────────────────────────────
    if (result !== null) {
      await setInCache(cacheKey, result);
      logger.info(
        { query, source: result.source, title: result.title },
        "Product enrichment completed — cached result",
      );
    } else {
      logger.info({ query }, "Product enrichment found no data");
    }

    return result;
  } catch (err) {
    logger.error({ err, query }, "Product enrichment failed unexpectedly");
    return null;
  } finally {
    releaseSemaphore();
  }
}

/**
 * Returns current semaphore utilisation — useful for health checks.
 */
export function getActiveScrapeCount(): number {
  return _activeScrapes;
}
