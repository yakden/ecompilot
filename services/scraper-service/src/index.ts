// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — scraper-service
// Playwright headless browser scraper — Google and Allegro product data
// ─────────────────────────────────────────────────────────────────────────────

import {
  initTelemetry,
  createLogger,
  registerGracefulShutdown,
  onShutdown,
} from "@ecompilot/shared-observability";
import type {
  HealthCheckResponse,
  ReadinessCheckResponse,
} from "@ecompilot/shared-types";

const telemetry = initTelemetry({ serviceName: "scraper-service" });
const logger = createLogger({ service: "scraper-service" });

import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { FastifyCorsOptions } from "@fastify/cors";
import type { RateLimitPluginOptions } from "@fastify/rate-limit";

import { env } from "./config/env.js";
import { createAuthPlugin, requireInternalService } from "@ecompilot/shared-auth";
import { launchBrowser, closeBrowser, isBrowserRunning } from "./services/browser.service.js";
import { scraperRoutes } from "./routes/scraper.routes.js";

const SERVICE_NAME = "scraper-service" as const;
const START_TIME = Date.now();

// ─────────────────────────────────────────────────────────────────────────────
// Redis client — shared module-level instance for graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────

let _redis: import("ioredis").default | null = null;

async function getRedisClient(): Promise<import("ioredis").default> {
  if (_redis !== null) return _redis;
  const { default: Redis } = await import("ioredis");
  _redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    enableReadyCheck: false,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 5) return null;
      return Math.min(times * 200, 2_000);
    },
  });
  await _redis.connect();
  return _redis;
}

async function closeRedisClient(): Promise<void> {
  if (_redis === null) return;
  try {
    await _redis.quit();
  } catch {
    _redis.disconnect();
  }
  _redis = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdLogLabel: "reqId",
    genReqId: () => crypto.randomUUID(),
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Security plugins
  // ─────────────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (app.register as any)(helmet, {
    contentSecurityPolicy: false,
  });

  const corsOptions: FastifyCorsOptions = {
    origin: false, // Internal service — CORS handled by API Gateway
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (app.register as any)(cors, corsOptions);

  const rateLimitOptions: RateLimitPluginOptions = {
    max: 30,       // Scraper is slow — intentionally lower limit
    timeWindow: "1 minute",
    errorResponseBuilder: (_request, context) => ({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: `Rate limit exceeded. Try again after ${String(context.after)}.`,
        timestamp: new Date().toISOString(),
      },
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (app.register as any)(rateLimit, rateLimitOptions);

  // ─────────────────────────────────────────────────────────────────────────
  // Request / response logging
  // ─────────────────────────────────────────────────────────────────────────
  app.addHook("onRequest", async (request) => {
    logger.info(
      {
        reqId: request.id,
        method: request.method,
        url: request.url,
      },
      "Incoming request",
    );
  });

  app.addHook("onResponse", async (request, reply) => {
    logger.info(
      {
        reqId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTimeMs: reply.elapsedTime,
      },
      "Request completed",
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Standard health / readiness endpoints
  // ─────────────────────────────────────────────────────────────────────────
  app.get("/ready", async (): Promise<ReadinessCheckResponse> => {
    return {
      ready: isBrowserRunning(),
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
    };
  });

  // /health is registered inside scraperRoutes (includes browser status)
  // This top-level one is a simpler alive check used by orchestrators
  app.get("/alive", async (): Promise<HealthCheckResponse> => {
    return {
      status: "healthy",
      service: SERVICE_NAME,
      version: process.env["npm_package_version"] ?? "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      dependencies: [],
    };
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Auth middleware -- scraper is internal-only
  // ─────────────────────────────────────────────────────────────────────────
  await app.register(createAuthPlugin({
    jwtPublicKey: process.env["JWT_PUBLIC_KEY"],
    jwtSecret: process.env["JWT_SECRET"],
    allowInternalHeaders: true,
    internalServiceSecret: process.env["INTERNAL_SERVICE_SECRET"] ?? "true",
  }) as unknown as Parameters<typeof app.register>[0]);

  // ─────────────────────────────────────────────────────────────────────────
  // Domain routes (includes /health with browser status, /api/v1/scraper/*)
  // ─────────────────────────────────────────────────────────────────────────
  await app.register(scraperRoutes);

  // ─────────────────────────────────────────────────────────────────────────
  // Graceful shutdown — LIFO order
  // ─────────────────────────────────────────────────────────────────────────
  onShutdown({
    description: "OpenTelemetry SDK",
    cleanup: async () => {
      await telemetry.shutdown();
    },
  });

  onShutdown({
    description: "Playwright browser",
    cleanup: async () => {
      await closeBrowser();
    },
  });

  onShutdown({
    description: "Redis client (scrape cache)",
    cleanup: async () => {
      await closeRedisClient();
    },
  });

  onShutdown({
    description: "Fastify HTTP server",
    cleanup: async () => {
      await app.close();
    },
  });

  registerGracefulShutdown(logger);

  // ─────────────────────────────────────────────────────────────────────────
  // Pre-flight: launch Playwright browser
  // Non-fatal — service can still start and return 503 on scrape requests
  // ─────────────────────────────────────────────────────────────────────────
  try {
    await launchBrowser();
    logger.info("Playwright browser ready");
  } catch (err) {
    logger.error(
      { err },
      "Playwright browser failed to launch — service will return 503 on scrape requests. " +
      "Fix: run `npx playwright install chromium` in the service directory.",
    );
    // Continue — HTTP server still starts for health checks
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pre-flight: verify Redis connectivity
  // ─────────────────────────────────────────────────────────────────────────
  try {
    await getRedisClient();
    logger.info("Redis connection verified");
  } catch (err) {
    logger.warn({ err }, "Redis pre-flight connection failed — caching disabled");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Start HTTP server
  // ─────────────────────────────────────────────────────────────────────────
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  logger.info(
    { port: env.PORT, host: "0.0.0.0", service: SERVICE_NAME },
    "Service started",
  );
}

bootstrap().catch((err: unknown) => {
  logger.fatal({ err }, "Failed to start scraper-service");
  process.exit(1);
});
