// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — scraper-service
// Allegro product page scraper
// ─────────────────────────────────────────────────────────────────────────────

import { createLogger } from "@ecompilot/shared-observability";
import { getPage, politeDelay } from "./browser.service.js";

const logger = createLogger({ service: "scraper-service" });

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductSpec {
  readonly name: string;
  readonly value: string;
}

export interface AllegroProduct {
  readonly title: string;
  readonly price: number | null;
  readonly currency: string;
  readonly description: string;
  readonly images: string[];
  readonly category: string;
  readonly specs: ProductSpec[];
  readonly seller: string;
  readonly rating: number | null;
  readonly url: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cookie consent handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleAllegroConsent(page: import("playwright").Page): Promise<void> {
  const consentSelectors = [
    'button[data-role="accept-consent"]',
    'button:has-text("Zgadzam się")',
    'button:has-text("Akceptuję")',
    'button:has-text("OK, rozumiem")',
    '[data-testid="consent-accept"]',
    '#onetrust-accept-btn-handler',
    'button.cookie-consent-accept',
  ];

  for (const selector of consentSelectors) {
    try {
      const button = page.locator(selector).first();
      const visible = await button.isVisible({ timeout: 2_000 });
      if (visible) {
        await button.click({ timeout: 3_000 });
        logger.debug({ selector }, "Dismissed Allegro cookie consent");
        await politeDelay(500, 500);
        return;
      }
    } catch {
      // Selector not found — try next
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Data extraction helpers
// ─────────────────────────────────────────────────────────────────────────────

interface RawAllegroData {
  title: string;
  rawPrice: string;
  currency: string;
  description: string;
  images: string[];
  breadcrumbs: string[];
  specs: Array<{ name: string; value: string }>;
  seller: string;
  rating: string;
}

/**
 * Extract all product data from the Allegro product page DOM.
 * Runs inside page.evaluate() — no logger, no imports available.
 */
async function extractAllegroData(page: import("playwright").Page): Promise<RawAllegroData> {
  return page.evaluate((): RawAllegroData => {
    // ── Title ──────────────────────────────────────────────────────────────
    const titleEl =
      document.querySelector<HTMLElement>('[data-testid="product-name"]') ??
      document.querySelector<HTMLElement>("h1");
    const title = titleEl?.textContent?.trim() ?? "";

    // ── Price ──────────────────────────────────────────────────────────────
    // Try testid attribute first, then meta tag, then visible price element
    const priceMeta = document.querySelector<HTMLMetaElement>(
      'meta[property="product:price:amount"]',
    );
    const priceTestId = document.querySelector<HTMLElement>('[data-testid="price"]');
    const priceEl = document.querySelector<HTMLElement>(
      '[aria-label*="cena"], [aria-label*="price"], .m-priceValue, ._1svub',
    );

    const rawPrice =
      priceMeta?.content?.trim() ??
      priceTestId?.textContent?.replace(/[^\d,\.]/g, "").trim() ??
      priceEl?.textContent?.replace(/[^\d,\.]/g, "").trim() ??
      "";

    const currencyMeta = document.querySelector<HTMLMetaElement>(
      'meta[property="product:price:currency"]',
    );
    const currency = currencyMeta?.content?.trim() ?? "PLN";

    // ── Description ────────────────────────────────────────────────────────
    const descEl =
      document.querySelector<HTMLElement>('[data-testid="description"]') ??
      document.querySelector<HTMLElement>("#description") ??
      document.querySelector<HTMLElement>(".ql-content");
    const description = descEl?.textContent?.trim().slice(0, 2000) ?? "";

    // ── Images ─────────────────────────────────────────────────────────────
    // Gallery / carousel images on Allegro use data-src or src
    const gallerySelectors = [
      '[data-testid="gallery"] img',
      '[data-testid="photo-carousel"] img',
      '[data-testid="product-gallery"] img',
      ".gallery img",
      "[class*='carousel'] img",
      "[class*='gallery'] img",
      "[class*='photo'] img",
    ];

    const imageUrls: string[] = [];
    const seenImages = new Set<string>();

    for (const selector of gallerySelectors) {
      const imgs = document.querySelectorAll<HTMLImageElement>(selector);
      for (const img of imgs) {
        const src =
          img.getAttribute("data-src") ??
          img.getAttribute("src") ??
          "";
        if (src === "" || seenImages.has(src) || src.startsWith("data:")) continue;
        // Only full-size images (skip tiny thumbnails by URL pattern)
        if (src.includes("thumbnail") || src.includes("small")) continue;
        seenImages.add(src);
        imageUrls.push(src);
      }
    }

    // ── Breadcrumbs / Category ─────────────────────────────────────────────
    const breadcrumbEls = document.querySelectorAll<HTMLElement>(
      'nav[aria-label*="breadcrumb"] a, [data-testid="breadcrumb"] a, .breadcrumb a',
    );
    const breadcrumbs = Array.from(breadcrumbEls)
      .map((el) => el.textContent?.trim() ?? "")
      .filter((t) => t !== "");

    // ── Specifications ─────────────────────────────────────────────────────
    const specs: Array<{ name: string; value: string }> = [];

    // Allegro spec tables use <tr> with two <td> cells
    const specSelectors = [
      '[data-testid="specification"] tr',
      '[data-testid="parameters"] tr',
      "table.specification tr",
      "table[class*='param'] tr",
      "[class*='specification'] tr",
    ];

    for (const selector of specSelectors) {
      const rows = document.querySelectorAll<HTMLTableRowElement>(selector);
      for (const row of rows) {
        const cells = row.querySelectorAll("td, th");
        if (cells.length < 2) continue;
        const name = cells[0]?.textContent?.trim() ?? "";
        const value = cells[1]?.textContent?.trim() ?? "";
        if (name !== "" && value !== "") {
          specs.push({ name, value });
        }
      }
      if (specs.length > 0) break;
    }

    // ── Seller ─────────────────────────────────────────────────────────────
    const sellerEl =
      document.querySelector<HTMLElement>('[data-testid="seller-name"]') ??
      document.querySelector<HTMLElement>('[data-testid="shop-name"]') ??
      document.querySelector<HTMLElement>("[class*='seller-name']");
    const seller = sellerEl?.textContent?.trim() ?? "";

    // ── Rating ─────────────────────────────────────────────────────────────
    const ratingEl =
      document.querySelector<HTMLElement>('[data-testid="rating"]') ??
      document.querySelector<HTMLElement>("[aria-label*='gwiazdki'], [aria-label*='stars']") ??
      document.querySelector<HTMLElement>("[class*='rating-value'], [class*='stars-value']");
    const rating = ratingEl?.textContent?.trim() ?? "";

    return {
      title,
      rawPrice,
      currency,
      description,
      images: imageUrls,
      breadcrumbs,
      specs,
      seller,
      rating,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Price parsing
// ─────────────────────────────────────────────────────────────────────────────

function parsePrice(rawPrice: string): number | null {
  if (rawPrice === "") return null;

  // Normalise Polish decimal format: "1 234,56" → "1234.56"
  const normalised = rawPrice
    .replace(/\s/g, "")     // remove whitespace/spaces
    .replace(",", ".");     // convert comma decimal to dot

  const parsed = parseFloat(normalised);
  return isNaN(parsed) ? null : parsed;
}

function parseRating(ratingStr: string): number | null {
  if (ratingStr === "") return null;
  const normalised = ratingStr.replace(",", ".");
  const match = normalised.match(/[\d.]+/);
  if (match === null) return null;
  const parsed = parseFloat(match[0]);
  return isNaN(parsed) ? null : parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scrape a single Allegro product page and return structured product data.
 *
 * Handles cookie consent popups automatically. Returns `null` on any error.
 *
 * @param url - Full Allegro product URL (https://allegro.pl/oferta/...)
 */
export async function scrapeAllegroProduct(url: string): Promise<AllegroProduct | null> {
  let page: import("playwright").Page | null = null;

  try {
    logger.debug({ url }, "Scraping Allegro product page");

    page = await getPage();

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Anti-detection: polite delay after page load
    await politeDelay(1_000, 2_000);

    // Dismiss cookie consent
    await handleAllegroConsent(page);

    // Wait for the product title to appear — indicates the page is ready
    try {
      await page.waitForSelector(
        '[data-testid="product-name"], h1',
        { timeout: 10_000 },
      );
    } catch {
      logger.warn({ url }, "Product title element not found on Allegro page");
    }

    // Anti-detection: brief delay before extraction
    await politeDelay(500, 1_000);

    const raw = await extractAllegroData(page);

    // A page without a title is not a valid product page
    if (raw.title === "") {
      logger.warn({ url }, "No product title found — likely redirected or blocked");
      return null;
    }

    const product: AllegroProduct = {
      title: raw.title,
      price: parsePrice(raw.rawPrice),
      currency: raw.currency,
      description: raw.description,
      images: raw.images,
      category: raw.breadcrumbs.join(" > "),
      specs: raw.specs,
      seller: raw.seller,
      rating: parseRating(raw.rating),
      url,
    };

    logger.info(
      {
        url,
        title: product.title,
        price: product.price,
        imageCount: product.images.length,
        specCount: product.specs.length,
      },
      "Allegro product scraped successfully",
    );

    return product;
  } catch (err) {
    logger.error({ err, url }, "Allegro product scrape failed");
    return null;
  } finally {
    if (page !== null) {
      await page.close().catch(() => {
        // Ignore close errors
      });
    }
  }
}
