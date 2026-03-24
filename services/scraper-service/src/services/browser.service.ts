// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — scraper-service
// Playwright browser lifecycle management
// ─────────────────────────────────────────────────────────────────────────────

import type { Browser, BrowserContext, Page } from "playwright";
import { createLogger } from "@ecompilot/shared-observability";
import { env } from "../config/env.js";

const logger = createLogger({ service: "scraper-service" });

// ─────────────────────────────────────────────────────────────────────────────
// User-Agent pool — realistic Chrome UAs for anti-bot evasion
// ─────────────────────────────────────────────────────────────────────────────

const USER_AGENTS: readonly string[] = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
];

// ─────────────────────────────────────────────────────────────────────────────
// Blocked resource types — speeds up scraping by skipping media assets
// ─────────────────────────────────────────────────────────────────────────────

const BLOCKED_RESOURCE_TYPES: ReadonlySet<string> = new Set([
  "image",
  "font",
  "stylesheet",
  "media",
  "ping",
  "beacon",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Module-level browser state
// ─────────────────────────────────────────────────────────────────────────────

let _browser: Browser | null = null;
let _context: BrowserContext | null = null;
let _isLaunching = false;

/**
 * Returns a randomly selected User-Agent from the pool.
 */
function pickRandomUserAgent(): string {
  const index = Math.floor(Math.random() * USER_AGENTS.length);
  // noUncheckedIndexedAccess guard
  return USER_AGENTS[index] ?? USER_AGENTS[0]!;
}

/**
 * Launch the Chromium browser and shared browser context.
 * Safe to call multiple times — reuses the existing instance.
 * Throws if Playwright/Chromium is not installed; callers should handle this.
 */
export async function launchBrowser(): Promise<void> {
  if (_browser !== null) {
    logger.debug("Browser already running — reusing instance");
    return;
  }

  if (_isLaunching) {
    // Another concurrent caller is already launching; wait briefly and return
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    return;
  }

  _isLaunching = true;

  try {
    // Dynamic import so the module still loads if playwright is missing
    const { chromium } = await import("playwright");

    _browser = await chromium.launch({
      headless: env.BROWSER_HEADLESS,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    _context = await _browser.newContext({
      userAgent: pickRandomUserAgent(),
      viewport: { width: 1920, height: 1080 },
      locale: "pl-PL",
      timezoneId: "Europe/Warsaw",
      // Suppress navigator.webdriver fingerprint
      javaScriptEnabled: true,
    });

    // Block heavy resources at the context level
    await _context.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
        route.abort().catch(() => {
          // Ignore abort errors during navigation
        });
      } else {
        route.continue().catch(() => {
          // Ignore continue errors during navigation
        });
      }
    });

    logger.info(
      { headless: env.BROWSER_HEADLESS },
      "Playwright Chromium browser launched",
    );
  } catch (err) {
    _browser = null;
    _context = null;
    logger.error(
      { err },
      "Failed to launch Playwright browser — scraping unavailable. " +
      "Run: npx playwright install chromium",
    );
    throw err;
  } finally {
    _isLaunching = false;
  }
}

/**
 * Returns a new Playwright Page from the shared browser context.
 * Each page gets a randomised User-Agent and a 30-second default timeout.
 *
 * @throws if the browser has not been launched via launchBrowser()
 */
export async function getPage(): Promise<Page> {
  if (_context === null) {
    throw new Error("Browser context not initialised — call launchBrowser() first");
  }

  const page = await _context.newPage();

  // Per-page timeout: 30 seconds for all navigation and wait operations
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(30_000);

  // Override User-Agent per page for additional rotation
  await page.setExtraHTTPHeaders({
    "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Upgrade-Insecure-Requests": "1",
  });

  return page;
}

/**
 * Returns true if the Playwright browser is currently running.
 */
export function isBrowserRunning(): boolean {
  return _browser !== null && _browser.isConnected();
}

/**
 * Gracefully close the browser and context.
 * Safe to call even if the browser was never launched.
 */
export async function closeBrowser(): Promise<void> {
  if (_context !== null) {
    try {
      await _context.close();
    } catch (err) {
      logger.warn({ err }, "Error closing browser context");
    }
    _context = null;
  }

  if (_browser !== null) {
    try {
      await _browser.close();
    } catch (err) {
      logger.warn({ err }, "Error closing browser");
    }
    _browser = null;
  }

  logger.info("Playwright browser closed");
}

/**
 * Introduce a randomised polite delay between scrape actions.
 * Range: [minMs, minMs + jitterMs]
 */
export async function politeDelay(minMs: number = 1_000, jitterMs: number = 2_000): Promise<void> {
  const delay = minMs + Math.floor(Math.random() * jitterMs);
  await new Promise<void>((resolve) => setTimeout(resolve, delay));
}
