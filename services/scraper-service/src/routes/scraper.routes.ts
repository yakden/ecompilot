// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — scraper-service
// HTTP routes for scraper endpoints
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { createLogger } from "@ecompilot/shared-observability";
import { requireInternalService } from "@ecompilot/shared-auth";
import { enrichProduct, getActiveScrapeCount } from "../services/product-enricher.js";
import { searchImages } from "../services/google-images.js";
import { isBrowserRunning } from "../services/browser.service.js";

const logger = createLogger({ service: "scraper-service" });

// ─────────────────────────────────────────────────────────────────────────────
// Request body schemas
// ─────────────────────────────────────────────────────────────────────────────

const SearchProductBodySchema = z.object({
  query: z
    .string()
    .min(1, "Query must not be empty")
    .max(200, "Query must not exceed 200 characters")
    .trim(),
});

const SearchImageBodySchema = z.object({
  query: z
    .string()
    .min(1, "Query must not be empty")
    .max(200, "Query must not exceed 200 characters")
    .trim(),
  count: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(5),
});

// ─────────────────────────────────────────────────────────────────────────────
// Route plugin
// ─────────────────────────────────────────────────────────────────────────────

export async function scraperRoutes(app: FastifyInstance): Promise<void> {
  // Scraper is internal-only -- require x-internal-service header on all routes
  const internalGuard = requireInternalService(process.env["INTERNAL_SERVICE_SECRET"] ?? "true");
  app.addHook("preHandler", async (request, reply) => {
    // Health endpoint stays public
    if (request.url === "/health") return;
    await internalGuard(request, reply);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // POST /api/v1/scraper/search-product
  //
  // Body:    { query: string }  — EAN barcode or product name
  // Returns: { found, product? }
  //
  // Runs the full enrichProduct waterfall:
  //   Google site:allegro.pl → scrape Allegro → Google organic → Google Images
  // ───────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/v1/scraper/search-product",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = SearchProductBodySchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            issues: parseResult.error.issues,
            timestamp: new Date().toISOString(),
          },
        });
      }

      const { query } = parseResult.data;

      logger.info({ query }, "search-product request received");

      if (!isBrowserRunning()) {
        logger.warn({ query }, "Browser not running — returning not found");
        return reply.status(503).send({
          success: false,
          error: {
            code: "BROWSER_UNAVAILABLE",
            message: "Scraper browser is not running. Install Playwright: npx playwright install chromium",
            timestamp: new Date().toISOString(),
          },
        });
      }

      const product = await enrichProduct(query);

      if (product === null) {
        return reply.send({
          success: true,
          data: {
            found: false,
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          found: true,
          product: {
            title: product.title,
            description: product.description,
            price: product.price,
            currency: product.currency,
            images: product.images,
            specs: product.specs,
            category: product.category,
            seller: product.seller,
            rating: product.rating,
            source: product.source,
            url: product.url,
          },
        },
      });
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // POST /api/v1/scraper/search-image
  //
  // Body:    { query: string, count?: number }
  // Returns: { images: string[] }
  //
  // Searches Google Images and returns up to `count` direct image URLs.
  // ───────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/v1/scraper/search-image",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = SearchImageBodySchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            issues: parseResult.error.issues,
            timestamp: new Date().toISOString(),
          },
        });
      }

      const { query, count } = parseResult.data;

      logger.info({ query, count }, "search-image request received");

      if (!isBrowserRunning()) {
        return reply.status(503).send({
          success: false,
          error: {
            code: "BROWSER_UNAVAILABLE",
            message: "Scraper browser is not running. Install Playwright: npx playwright install chromium",
            timestamp: new Date().toISOString(),
          },
        });
      }

      const images = await searchImages(query, count);

      return reply.send({
        success: true,
        data: {
          images,
        },
      });
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // GET /health
  //
  // Returns browser status and active scrape count.
  // Compatible with standard EcomPilot health check contracts.
  // ───────────────────────────────────────────────────────────────────────────
  app.get(
    "/health",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const browserStatus = isBrowserRunning() ? "running" : "stopped";
      const activeScrapes = getActiveScrapeCount();

      return reply.send({
        status: "healthy",
        service: "scraper-service",
        version: process.env["npm_package_version"] ?? "0.1.0",
        timestamp: new Date().toISOString(),
        dependencies: [
          {
            name: "playwright-browser",
            status: browserStatus,
            details: {
              activeScrapes,
            },
          },
        ],
      });
    },
  );
}
