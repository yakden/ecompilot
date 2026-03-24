// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — analytics-service
// Analytics & reporting service (ClickHouse, marketplace data)
// ─────────────────────────────────────────────────────────────────────────────

import { initTelemetry, createLogger, registerGracefulShutdown, onShutdown } from "@ecompilot/shared-observability";
import type { HealthCheckResponse, ReadinessCheckResponse, DependencyHealth } from "@ecompilot/shared-types";

const telemetry = initTelemetry({ serviceName: "analytics-service" });
const logger = createLogger({ service: "analytics-service" });

// env must be loaded AFTER telemetry (which patches globals)
import { env } from "./config/env.js";
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { FastifyCorsOptions } from "@fastify/cors";
import type { RateLimitPluginOptions } from "@fastify/rate-limit";
import { createAuthMiddleware } from "@ecompilot/shared-auth";
import { analyticsRoutes } from "./routes/analytics.routes.js";
import { createNicheAnalysisWorker, closeWorkerNats } from "./workers/niche-analysis.worker.js";
import { getPool, closePool, pingPostgres } from "./db/postgres.js";
import { initClickHouseSchema, closeClickHouseClient, pingClickHouse } from "./db/clickhouse.js";
import { closeBrowser } from "./scrapers/allegro.scraper.js";
import { closeComtradeRedis } from "./services/comtrade.service.js";
import { closeEurostatRedis } from "./services/eurostat.service.js";

const SERVICE_NAME = "analytics-service" as const;
const START_TIME = Date.now();

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // ── 1. Validate DB connections early ─────────────────────────────────────

  logger.info("Initialising PostgreSQL pool...");
  getPool(); // creates and validates pool configuration

  logger.info("Initialising ClickHouse schema...");
  await initClickHouseSchema();

  // ── 2. Start BullMQ worker ───────────────────────────────────────────────

  const nicheWorker = createNicheAnalysisWorker();

  // ── 3. Build Fastify app ─────────────────────────────────────────────────

  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdLogLabel: "reqId",
    genReqId: () => crypto.randomUUID(),
  });

  // ── 4. Security & middleware plugins ─────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (app.register as any)(helmet, {
    contentSecurityPolicy: false,
  });

  const corsOptions: FastifyCorsOptions = {
    origin: env.NODE_ENV === "production"
      ? ["https://app.ecompilot.pl", "https://ecompilot.pl"]
      : true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-User-Id", "X-User-Plan", "X-Internal-Service", "X-Correlation-Id"],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (app.register as any)(cors, corsOptions);

  const rateLimitOptions: RateLimitPluginOptions = {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (request) =>
      (request as unknown as { authUser?: { sub?: string } | null }).authUser?.sub ??
      request.ip,
    errorResponseBuilder: (_request, context) => ({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: `Too many requests. Limit: ${context.max} per ${context.after}.`,
        timestamp: new Date().toISOString(),
      },
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (app.register as any)(rateLimit, rateLimitOptions);

  // ── 5. Logging hooks ──────────────────────────────────────────────────────

  app.addHook("onRequest", async (request) => {
    logger.info({
      reqId: request.id,
      method: request.method,
      url: request.url,
      userAgent: request.headers["user-agent"],
    }, "Incoming request");
  });

  app.addHook("onResponse", async (request, reply) => {
    logger.info({
      reqId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTimeMs: reply.elapsedTime,
    }, "Request completed");
  });

  // ── 6. Health & readiness endpoints ──────────────────────────────────────

  app.get("/health", async (): Promise<HealthCheckResponse> => {
    const [pgOk, chOk] = await Promise.all([pingPostgres(), pingClickHouse()]);

    const dependencies: DependencyHealth[] = [
      { name: "postgresql", status: pgOk ? "up" : "down" },
      { name: "clickhouse", status: chOk ? "up" : "down" },
    ];

    const anyDown = dependencies.some((d) => d.status === "down");

    return {
      status: anyDown ? "degraded" : "healthy",
      service: SERVICE_NAME,
      version: process.env["npm_package_version"] ?? "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      dependencies,
    };
  });

  app.get("/ready", async (): Promise<ReadinessCheckResponse> => {
    const [pgOk, chOk] = await Promise.all([pingPostgres(), pingClickHouse()]);

    return {
      ready: pgOk && chOk,
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
    };
  });

  // ── 7. Auth middleware (registered directly to avoid Fastify encapsulation) ─

  app.decorateRequest("authUser", null);
  app.addHook("onRequest", createAuthMiddleware({
    jwtPublicKey: process.env["JWT_PUBLIC_KEY"],
    jwtSecret: process.env["JWT_SECRET"],
    allowInternalHeaders: true,
    internalServiceSecret: process.env["INTERNAL_SERVICE_SECRET"] ?? "true",
  }));

  // ── 8. Business routes ────────────────────────────────────────────────────

  await app.register(analyticsRoutes);

  // ── 8. Graceful shutdown hooks ────────────────────────────────────────────

  onShutdown({
    description: "Fastify HTTP server",
    cleanup: async () => {
      await app.close();
    },
  });

  onShutdown({
    description: "BullMQ niche analysis worker",
    cleanup: async () => {
      await nicheWorker.close();
    },
  });

  onShutdown({
    description: "NATS connection (worker)",
    cleanup: async () => {
      await closeWorkerNats();
    },
  });

  onShutdown({
    description: "Playwright browser",
    cleanup: async () => {
      await closeBrowser();
    },
  });

  onShutdown({
    description: "ClickHouse client",
    cleanup: async () => {
      await closeClickHouseClient();
    },
  });

  onShutdown({
    description: "PostgreSQL pool",
    cleanup: async () => {
      await closePool();
    },
  });

  onShutdown({
    description: "Comtrade Redis client",
    cleanup: async () => {
      await closeComtradeRedis();
    },
  });

  onShutdown({
    description: "Eurostat Redis client",
    cleanup: async () => {
      await closeEurostatRedis();
    },
  });

  onShutdown({
    description: "OpenTelemetry SDK",
    cleanup: async () => {
      await telemetry.shutdown();
    },
  });

  registerGracefulShutdown(logger);

  // ── 9. Start listening ────────────────────────────────────────────────────

  await app.listen({ port: env.PORT, host: env.HOST });

  logger.info(
    {
      port: env.PORT,
      host: env.HOST,
      service: SERVICE_NAME,
      nodeEnv: env.NODE_ENV,
    },
    "Service started",
  );
}

bootstrap().catch((err: unknown) => {
  logger.fatal({ err }, "Failed to start service");
  process.exit(1);
});
