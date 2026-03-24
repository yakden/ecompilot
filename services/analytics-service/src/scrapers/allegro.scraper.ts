// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — analytics-service
// Allegro.pl Playwright scraper with PQueue + p-retry
// ─────────────────────────────────────────────────────────────────────────────

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import PQueue from "p-queue";
import pRetry, { type Options as RetryOptions } from "p-retry";
import { createLogger } from "@ecompilot/shared-observability";

const logger = createLogger({ service: "analytics-service" });

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AllegroListing {
  readonly id: string;
  readonly title: string;
  readonly price: number;
  readonly sellerName: string;
  readonly sellerRating: number;
  readonly reviewCount: number;
  readonly category: string;
  readonly imageUrl: string | null;
  readonly url: string;
}

export interface ScraperResult {
  readonly keyword: string;
  readonly listings: AllegroListing[];
  readonly scrapedAt: string;
  readonly totalFound: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// User-Agent pool (Chrome 124+)
// ─────────────────────────────────────────────────────────────────────────────

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
] as const;

function randomUserAgent(): string {
  const idx = Math.floor(Math.random() * USER_AGENTS.length);
  return USER_AGENTS[idx] ?? USER_AGENTS[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue configuration
// concurrency: 3, intervalCap: 10 per 1000ms
// ─────────────────────────────────────────────────────────────────────────────

const queue = new PQueue({
  concurrency: 3,
  intervalCap: 10,
  interval: 1000,
});

// ─────────────────────────────────────────────────────────────────────────────
// p-retry configuration
// ─────────────────────────────────────────────────────────────────────────────

const RETRY_OPTIONS: RetryOptions = {
  retries: 3,
  minTimeout: 2000,
  factor: 2,
  onFailedAttempt: (error) => {
    logger.warn(
      {
        attempt: error.attemptNumber,
        retriesLeft: error.retriesLeft,
        message: error.message,
      },
      "Scrape attempt failed, retrying",
    );
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Browser lifecycle management
// ─────────────────────────────────────────────────────────────────────────────

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser === null || !_browser.isConnected()) {
    _browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1920,1080",
      ],
    });
  }
  return _browser;
}

async function createContext(userAgent: string): Promise<BrowserContext> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent,
    viewport: { width: 1920, height: 1080 },
    locale: "pl-PL",
    timezoneId: "Europe/Warsaw",
    extraHTTPHeaders: {
      "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
    },
  });

  // Mask automation signals
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  return context;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse listing data from a loaded Allegro results page
// ─────────────────────────────────────────────────────────────────────────────

async function parseListings(page: Page): Promise<AllegroListing[]> {
  // page.evaluate runs in the browser context — cast to any to access browser globals
  // (document, HTMLAnchorElement) that are not in the Node.js lib configuration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return page.evaluate((): AllegroListing[] => {
    const results: AllegroListing[] = [];
    // Access browser globals via globalThis to satisfy the Node-targeted TypeScript compiler
    const doc = (globalThis as unknown as { document: { querySelectorAll(sel: string): Iterable<{ querySelector(sel: string): { textContent: string | null; getAttribute(attr: string): string | null } | null; querySelectorAll?: unknown } & Record<string, unknown>> } }).document;

    // Allegro listing articles — selector targets the main search result grid items
    const articles = doc.querySelectorAll(
      'article[data-role="offer"], [data-box-name="Listing"] article',
    );

    for (const article of articles) {
      const a = article as unknown as { querySelector(sel: string): ({ textContent: string | null; getAttribute(attr: string): string | null; href?: string } | null) };
      const titleEl = a.querySelector(
        "h2 a, [data-role='offer-title'], .mpof_ki a",
      );
      const priceEl = a.querySelector(
        "[data-role='price-value'], .mpof_price, .price",
      );
      const sellerEl = a.querySelector(
        "[data-role='seller-link'], .seller-name, [data-analytics-click-value='seller']",
      );
      const ratingEl = a.querySelector(
        "[aria-label*='ocen'], [aria-label*='rating'], .seller-rating",
      );
      const reviewEl = a.querySelector(
        "[data-role='reviews-count'], .review-count, [aria-label*='opini']",
      );
      const categoryEl = a.querySelector(
        "[data-role='breadcrumb'], .category-name, [data-analytics-category]",
      );
      const imageEl = a.querySelector("img[data-role='offer-thumbnail'], .offer-photo img, img");
      const linkEl = a.querySelector("h2 a, a[href*='/oferta/']");

      if (titleEl === null || linkEl === null) continue;

      const rawPrice = priceEl?.textContent?.replace(/[^\d,]/g, "").replace(",", ".") ?? "0";
      const price = parseFloat(rawPrice);

      const rawRating =
        ratingEl?.getAttribute("aria-label")?.match(/[\d,.]+/)?.[0] ?? "0";
      const sellerRating = parseFloat(rawRating.replace(",", "."));

      const rawReviews =
        reviewEl?.textContent?.replace(/[^\d]/g, "") ?? "0";
      const reviewCount = parseInt(rawReviews, 10);

      const href = (linkEl.href as string | undefined) ?? "";
      const idMatch = href.match(/\/oferta\/([^?#]+)/);
      const id = idMatch?.[1] ?? crypto.randomUUID();

      const imgSrc =
        imageEl?.getAttribute("src") ?? imageEl?.getAttribute("data-src") ?? null;

      results.push({
        id,
        title: titleEl.textContent?.trim() ?? "",
        price: isNaN(price) ? 0 : price,
        sellerName: sellerEl?.textContent?.trim() ?? "Unknown",
        sellerRating: isNaN(sellerRating) ? 0 : sellerRating,
        reviewCount: isNaN(reviewCount) ? 0 : reviewCount,
        category: categoryEl?.textContent?.trim() ?? "Uncategorized",
        imageUrl: imgSrc,
        url: href,
      });
    }

    return results;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Core scrape function (single keyword, single page)
// ─────────────────────────────────────────────────────────────────────────────

async function scrapeKeywordPage(keyword: string): Promise<AllegroListing[]> {
  const userAgent = randomUserAgent();
  const context = await createContext(userAgent);
  const page = await context.newPage();

  try {
    const url = `https://allegro.pl/listing?string=${encodeURIComponent(keyword)}`;

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // Wait for listings to appear
    await page
      .waitForSelector(
        'article[data-role="offer"], [data-box-name="Listing"] article',
        { timeout: 10_000 },
      )
      .catch(() => {
        // Listings may not exist for this keyword
      });

    // Human-like random delay
    await page.waitForTimeout(500 + Math.floor(Math.random() * 1000));

    const listings = await parseListings(page);

    logger.info(
      { keyword, listingsFound: listings.length, userAgent: userAgent.slice(0, 50) },
      "Scraped Allegro page",
    );

    return listings;
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scrape Allegro listings for a given keyword.
 * Uses PQueue for concurrency control and p-retry for resilience.
 */
export async function scrapeAllegro(keyword: string): Promise<ScraperResult> {
  const listings = await queue.add(
    () =>
      pRetry(
        () => scrapeKeywordPage(keyword),
        RETRY_OPTIONS,
      ),
    { priority: 0 },
  );

  const resolvedListings = listings ?? [];

  return {
    keyword,
    listings: resolvedListings,
    scrapedAt: new Date().toISOString(),
    totalFound: resolvedListings.length,
  };
}

/**
 * Scrape multiple keywords with queue-managed concurrency.
 */
export async function scrapeMultipleKeywords(
  keywords: readonly string[],
): Promise<ScraperResult[]> {
  const tasks = keywords.map((keyword) => scrapeAllegro(keyword));
  return Promise.all(tasks);
}

/**
 * Gracefully close the shared Playwright browser instance.
 */
export async function closeBrowser(): Promise<void> {
  if (_browser !== null && _browser.isConnected()) {
    await _browser.close();
    _browser = null;
  }
}

/**
 * Returns current queue stats for observability.
 */
export function getQueueStats(): {
  pending: number;
  running: number;
  size: number;
} {
  return {
    pending: queue.pending,
    running: queue.size,
    size: queue.size + queue.pending,
  };
}
