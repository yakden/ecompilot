// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — marketplace-hub
// Canonical adapter hub over 8 Polish marketplaces
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

const telemetry = initTelemetry({ serviceName: "marketplace-hub" });
const logger = createLogger({ service: "marketplace-hub" });

import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import type { Redis } from "./services/redis.client.js";

import { env } from "./config/env.js";
import { createAuthPlugin } from "@ecompilot/shared-auth";
import { getDb, closeDb, getPool } from "./db/client.js";

// ── Connectors ───────────────────────────────────────────────────────────────
import { AllegroConnector } from "./connectors/allegro.connector.js";
import { AmazonConnector } from "./connectors/amazon.connector.js";
import type { MarketplaceConnector } from "./types/marketplace.js";

// ── Services ─────────────────────────────────────────────────────────────────
import { NatsPublisher } from "./services/nats.publisher.js";
import { AccountService } from "./services/account.service.js";
import { StockSyncService } from "./services/stock-sync.service.js";
import { PollingService } from "./services/polling.service.js";

// ── Routes ───────────────────────────────────────────────────────────────────
import {
  registerMarketplaceRoutes,
  type MarketplaceRouteContext,
} from "./routes/marketplace.routes.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = "marketplace-hub" as const;
const START_TIME = Date.now();

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // ── 1. Connector registry ────────────────────────────────────────────────
  const connectors = new Map<string, MarketplaceConnector>([
    ["allegro", new AllegroConnector(logger)],
    ["amazon", new AmazonConnector(logger)],
  ]);

  logger.info(
    { platforms: [...connectors.keys()] },
    "Marketplace connectors registered",
  );

  // ── 2. Redis ─────────────────────────────────────────────────────────────
  // Dynamic import for ioredis — installed via pnpm install after package.json update
  const { createRedisClient } = await import("./services/redis.client.js");
  const redis: Redis = createRedisClient(env.REDIS_URL);

  redis.on("error", (err: unknown) => {
    logger.error({ err }, "Redis connection error");
  });

  await redis.connect();
  logger.info({ url: env.REDIS_URL }, "Redis connected");

  // ── 3. NATS ───────────────────────────────────────────────────────────────
  const nats = new NatsPublisher(logger);
  await nats.connect();

  // ── 4. Database ───────────────────────────────────────────────────────────
  const db = getDb();

  // Verify connection
  await getPool().query("SELECT 1");
  logger.info(
    { url: env.DATABASE_URL.replace(/:[^:@]+@/, ":***@") },
    "Database connected",
  );

  // ── 5. Services ───────────────────────────────────────────────────────────
  const stockSync = new StockSyncService(db, connectors, nats, logger);
  const accountService = new AccountService(db, connectors, nats, logger);
  const pollingService = new PollingService(
    redis,
    db,
    connectors,
    stockSync,
    nats,
    logger,
  );

  await pollingService.start();
  logger.info("Polling service started");

  // ── 6. Fastify ────────────────────────────────────────────────────────────
  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdLogLabel: "reqId",
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(helmet as unknown as Parameters<typeof app.register>[0], {
    contentSecurityPolicy: false,
  });

  await app.register(cors as unknown as Parameters<typeof app.register>[0], {
    origin: false, // Handled by API gateway
  });

  // ── Request/response logging ─────────────────────────────────────────────
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

  // ── Health endpoints ──────────────────────────────────────────────────────
  app.get("/health", async (): Promise<HealthCheckResponse> => {
    const dbStatus = await getPool()
      .query("SELECT 1")
      .then(() => "up" as const)
      .catch(() => "down" as const);

    const redisStatus = await redis
      .ping()
      .then(() => "up" as const)
      .catch(() => "down" as const);

    const allUp = dbStatus === "up" && redisStatus === "up";

    return {
      status: allUp ? "healthy" : "degraded",
      service: SERVICE_NAME,
      version: process.env["npm_package_version"] ?? "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      dependencies: [
        { name: "postgresql", status: dbStatus },
        { name: "redis", status: redisStatus },
        { name: "nats", status: "up" },
      ],
    };
  });

  app.get("/ready", async (_, reply): Promise<ReadinessCheckResponse> => {
    const dbOk = await getPool()
      .query("SELECT 1")
      .then(() => true)
      .catch(() => false);

    const redisOk = await redis
      .ping()
      .then(() => true)
      .catch(() => false);

    if (!dbOk || !redisOk) {
      return reply.status(503).send({
        ready: false,
        service: SERVICE_NAME,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      ready: true,
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
    };
  });

  // ── Auth middleware ──────────────────────────────────────────────────────
  await app.register(createAuthPlugin({
    jwtPublicKey: process.env["JWT_PUBLIC_KEY"],
    jwtSecret: process.env["JWT_SECRET"],
    allowInternalHeaders: true,
    internalServiceSecret: process.env["INTERNAL_SERVICE_SECRET"] ?? "true",
  }) as unknown as Parameters<typeof app.register>[0]);

  // ── Marketplace routes ────────────────────────────────────────────────────
  const routeCtx: MarketplaceRouteContext = {
    accountService,
    stockSync,
    connectors,
    nats,
    logger,
  };

  await registerMarketplaceRoutes(app, routeCtx);

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  onShutdown({
    description: "BullMQ polling service",
    cleanup: async () => {
      await pollingService.stop();
    },
  });

  onShutdown({
    description: "NATS JetStream connection",
    cleanup: async () => {
      await nats.close();
    },
  });

  onShutdown({
    description: "Redis connection",
    cleanup: async () => {
      await redis.quit();
    },
  });

  onShutdown({
    description: "PostgreSQL pool",
    cleanup: async () => {
      await closeDb();
    },
  });

  onShutdown({
    description: "Fastify HTTP server",
    cleanup: async () => {
      await app.close();
    },
  });

  onShutdown({
    description: "OpenTelemetry SDK",
    cleanup: async () => {
      await telemetry.shutdown();
    },
  });

  registerGracefulShutdown(logger);

  // ── Start server ──────────────────────────────────────────────────────────
  await app.listen({ port: env.PORT, host: env.HOST });

  logger.info(
    {
      port: env.PORT,
      host: env.HOST,
      service: SERVICE_NAME,
      platforms: [...connectors.keys()],
    },
    "marketplace-hub started",
  );
}

bootstrap().catch((err: unknown) => {
  logger.fatal({ err }, "Failed to start marketplace-hub");
  process.exit(1);
});
