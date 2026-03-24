// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — scraper-service
// Google organic search scraper
// ─────────────────────────────────────────────────────────────────────────────

import { createLogger } from "@ecompilot/shared-observability";
import { getPage, politeDelay } from "./browser.service.js";

const logger = createLogger({ service: "scraper-service" });

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GoogleResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Consent page handling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dismiss the Google consent / cookie popup if present.
 * Clicks "Accept all" button variants across different Google consent UIs.
 */
async function handleGoogleConsent(page: import("playwright").Page): Promise<void> {
  // Common selector patterns for the Google consent banner
  const consentSelectors = [
    'button[id="L2AGLb"]',           // "Accept all" by element ID
    'button:has-text("Zaakceptuj wszystko")',  // Polish
    'button:has-text("Accept all")',  // English fallback
    'button:has-text("Accettare tutto")', // Other locale fallback
    '[aria-label="Zaakceptuj wszystko"]',
    '[aria-label="Accept all"]',
  ];

  for (const selector of consentSelectors) {
    try {
      const button = page.locator(selector).first();
      const visible = await button.isVisible({ timeout: 2_000 });
      if (visible) {
        await button.click({ timeout: 3_000 });
        logger.debug({ selector }, "Dismissed Google consent popup");
        // Brief pause after dismissal for page to settle
        await politeDelay(500, 500);
        return;
      }
    } catch {
      // Selector not found — try next
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Search result parsers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract organic search results from the loaded Google SERP.
 * Handles both the classic `#search` layout and modern card-based layouts.
 */
async function extractOrganicResults(
  page: import("playwright").Page,
): Promise<GoogleResult[]> {
  return page.evaluate((): GoogleResult[] => {
    const results: GoogleResult[] = [];

    // Primary selector: standard organic result containers
    // Google uses various class names; we target the anchored heading pattern
    const resultContainers = document.querySelectorAll(
      "div.g, div[data-sokoban-container], div[jscontroller][data-hveid]",
    );

    for (const container of resultContainers) {
      if (results.length >= 10) break;

      // Title: first h3 within the result
      const titleEl = container.querySelector("h3");
      if (titleEl === null) continue;

      const title = titleEl.textContent?.trim() ?? "";
      if (title === "") continue;

      // URL: first <a> with an href pointing to an external page
      const linkEl = container.querySelector("a[href]");
      const href = linkEl?.getAttribute("href") ?? "";

      // Skip Google-internal links (images, maps, etc.)
      if (!href.startsWith("http") || href.includes("google.com")) continue;

      // Snippet: element with class containing "VwiC3b" or "st" or "IsZvec"
      const snippetEl = container.querySelector(
        "div.VwiC3b, span.st, div.IsZvec, div[data-sncf], div.lEBKkf",
      );
      const snippet = snippetEl?.textContent?.trim() ?? "";

      results.push({ title, url: href, snippet });
    }

    // Fallback: try simple anchor + h3 pattern if containers returned nothing
    if (results.length === 0) {
      const headings = document.querySelectorAll("#search h3");
      for (const h3 of headings) {
        if (results.length >= 10) break;
        const anchor = h3.closest("a") ?? h3.parentElement?.querySelector("a");
        const href = anchor?.getAttribute("href") ?? "";
        if (!href.startsWith("http") || href.includes("google.com")) continue;

        const title = h3.textContent?.trim() ?? "";
        if (title === "") continue;

        results.push({ title, url: href, snippet: "" });
      }
    }

    return results;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Perform a Google organic search and return up to 10 structured results.
 *
 * @param query - Search query string (will be URI-encoded)
 * @returns Array of GoogleResult objects; empty array on any error
 */
export async function searchGoogle(query: string): Promise<GoogleResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const searchUrl = `https://www.google.com/search?q=${encodedQuery}&hl=pl&num=10`;

  let page: import("playwright").Page | null = null;

  try {
    page = await getPage();

    logger.debug({ query, url: searchUrl }, "Starting Google search");

    // Navigate with wait until DOM is interactive
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Anti-detection: brief random delay after page load
    await politeDelay(1_000, 2_000);

    // Dismiss consent popup if shown
    await handleGoogleConsent(page);

    // Wait for search results container
    try {
      await page.waitForSelector("#search, #rso, #center_col", { timeout: 10_000 });
    } catch {
      logger.warn({ query }, "Google search results container not found");
    }

    // Anti-detection: brief delay before extraction
    await politeDelay(500, 1_000);

    const results = await extractOrganicResults(page);

    logger.info({ query, resultCount: results.length }, "Google search completed");

    return results;
  } catch (err) {
    logger.error({ err, query }, "Google search failed");
    return [];
  } finally {
    if (page !== null) {
      await page.close().catch(() => {
        // Ignore close errors
      });
    }
  }
}
