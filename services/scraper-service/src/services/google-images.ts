// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — scraper-service
// Google Images scraper — returns direct image URLs from thumbnail grid
// ─────────────────────────────────────────────────────────────────────────────

import { createLogger } from "@ecompilot/shared-observability";
import { getPage, politeDelay } from "./browser.service.js";

const logger = createLogger({ service: "scraper-service" });

// Minimum acceptable image dimension in pixels — filters out favicon-sized icons
const MIN_IMAGE_DIMENSION = 100;

// ─────────────────────────────────────────────────────────────────────────────
// Image URL extraction helpers
// ─────────────────────────────────────────────────────────────────────────────

interface RawImageCandidate {
  src: string;
  width: number;
  height: number;
}

/**
 * Extract image candidates from the Google Images thumbnail grid.
 * Google encodes actual image URLs in data attributes on the grid tiles.
 */
async function extractImageCandidates(
  page: import("playwright").Page,
): Promise<RawImageCandidate[]> {
  return page.evaluate((minDim: number): RawImageCandidate[] => {
    const candidates: RawImageCandidate[] = [];

    // Google Images embeds full-size URLs in script tags as JSON arrays.
    // The thumbnail <img> elements carry data-src or src with the thumbnail.
    // We collect both and filter by size.

    // Strategy 1: collect <img> elements within image result tiles
    const imgSelectors = [
      "div[data-q] img",          // image tile containers
      "g-img img",                 // Google image component
      "div.ivg-i img",
      "div.rg_i img",
      "div[jsaction] img[data-src]",
      "img[data-iurl]",
    ];

    const seen = new Set<string>();

    for (const selector of imgSelectors) {
      const imgs = document.querySelectorAll<HTMLImageElement>(selector);
      for (const img of imgs) {
        // Prefer data-src (lazy-loaded) over src (often a placeholder)
        const src =
          img.getAttribute("data-iurl") ??
          img.getAttribute("data-src") ??
          img.getAttribute("src") ??
          "";

        if (src === "" || seen.has(src)) continue;

        // Skip data URIs (inline base64 thumbnails — too small) and google URLs
        if (src.startsWith("data:") || src.includes("google.com/logos")) continue;

        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;

        // Include if either dimension is satisfactory, or if unknown (0)
        if ((w > 0 && w < minDim) || (h > 0 && h < minDim)) continue;

        seen.add(src);
        candidates.push({ src, width: w, height: h });
      }
    }

    // Strategy 2: look for AF_initDataCallback JSON blobs which contain image URLs
    if (candidates.length < 5) {
      const scripts = document.querySelectorAll("script");
      const urlPattern = /https?:\/\/[^"'\\]+\.(?:jpg|jpeg|png|webp|gif)[^"'\\]*/gi;

      for (const script of scripts) {
        const text = script.textContent ?? "";
        if (!text.includes("AF_initDataCallback") && !text.includes("_setImagesSrc")) continue;

        const matches = text.match(urlPattern);
        if (matches === null) continue;

        for (const match of matches) {
          const cleaned = match.replace(/\\u003d/gi, "=").replace(/\\u0026/gi, "&");
          if (seen.has(cleaned)) continue;
          if (cleaned.includes("gstatic") && cleaned.includes("favicon")) continue;

          seen.add(cleaned);
          candidates.push({ src: cleaned, width: 0, height: 0 });
        }
      }
    }

    return candidates;
  }, MIN_IMAGE_DIMENSION);
}

// ─────────────────────────────────────────────────────────────────────────────
// Consent page handling (shared pattern with google-search)
// ─────────────────────────────────────────────────────────────────────────────

async function handleGoogleConsent(page: import("playwright").Page): Promise<void> {
  const consentSelectors = [
    'button[id="L2AGLb"]',
    'button:has-text("Zaakceptuj wszystko")',
    'button:has-text("Accept all")',
    '[aria-label="Zaakceptuj wszystko"]',
    '[aria-label="Accept all"]',
  ];

  for (const selector of consentSelectors) {
    try {
      const button = page.locator(selector).first();
      const visible = await button.isVisible({ timeout: 2_000 });
      if (visible) {
        await button.click({ timeout: 3_000 });
        await politeDelay(500, 500);
        return;
      }
    } catch {
      // Not found — try next
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search Google Images for the given query and return up to `count` image URLs.
 *
 * Images are filtered to exclude tiny icons and Google-hosted logos.
 * Returns an empty array on any error (never throws).
 *
 * @param query - Search query string
 * @param count - Maximum number of image URLs to return (default: 5)
 */
export async function searchImages(query: string, count: number = 5): Promise<string[]> {
  const safeCount = Math.min(Math.max(1, count), 20);
  const encodedQuery = encodeURIComponent(`${query} product`);
  const searchUrl = `https://www.google.com/search?q=${encodedQuery}&tbm=isch&hl=pl`;

  let page: import("playwright").Page | null = null;

  try {
    page = await getPage();

    logger.debug({ query, count: safeCount, url: searchUrl }, "Starting Google Images search");

    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Anti-detection delay
    await politeDelay(1_000, 2_000);

    // Dismiss consent if shown
    await handleGoogleConsent(page);

    // Wait for the image grid to appear
    try {
      await page.waitForSelector(
        "div[data-q], g-img, div.rg_i, div[jsaction] img",
        { timeout: 10_000 },
      );
    } catch {
      logger.warn({ query }, "Google Images grid not found in DOM");
    }

    // Brief delay before extraction
    await politeDelay(500, 1_000);

    const candidates = await extractImageCandidates(page);

    // Deduplicate and take top N
    const seen = new Set<string>();
    const imageUrls: string[] = [];

    for (const candidate of candidates) {
      if (imageUrls.length >= safeCount) break;

      const url = candidate.src.trim();
      if (url === "" || seen.has(url)) continue;

      // Filter out non-image URLs and tiny icons
      if (
        !url.startsWith("http") ||
        url.includes("favicon") ||
        url.includes("icon") ||
        url.endsWith(".svg")
      ) {
        continue;
      }

      seen.add(url);
      imageUrls.push(url);
    }

    logger.info({ query, found: imageUrls.length }, "Google Images search completed");

    return imageUrls;
  } catch (err) {
    logger.error({ err, query }, "Google Images search failed");
    return [];
  } finally {
    if (page !== null) {
      await page.close().catch(() => {
        // Ignore close errors
      });
    }
  }
}
