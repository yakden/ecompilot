// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — legal-service
// Legal document templates and compliance
// ─────────────────────────────────────────────────────────────────────────────

import { initTelemetry, createLogger, registerGracefulShutdown, onShutdown } from "@ecompilot/shared-observability";
import type { HealthCheckResponse, ReadinessCheckResponse } from "@ecompilot/shared-types";

const telemetry = initTelemetry({ serviceName: "legal-service" });
const logger = createLogger({ service: "legal-service" });

import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { createAuthPlugin } from "@ecompilot/shared-auth";
import { getDb, closeDb } from "./db/client.js";
import { initCache } from "./middleware/cache.js";
import { legalRoutes } from "./routes/legal.routes.js";
import { env } from "./config/env.js";

const SERVICE_NAME = "legal-service" as const;
const PORT = Number(process.env["PORT"] ?? 3000);
const HOST = process.env["HOST"] ?? "0.0.0.0";
const START_TIME = Date.now();

async function bootstrap(): Promise<void> {
  // ── Database — initialise connection pool before registering routes ─────────
  getDb();
  logger.info("Database connection pool initialised");

  // ── Redis cache — connect and register middleware ────────────────────────────
  try {
    const { default: Redis } = await import("ioredis");
    const redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
    await redis.connect();
    initCache(redis);
    logger.info("Redis cache connected");

    onShutdown({
      description: "Redis client",
      cleanup: async () => {
        redis.disconnect();
      },
    });
  } catch (err) {
    logger.warn({ err }, "Redis unavailable — cache disabled, continuing without it");
  }

  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdLogLabel: "reqId",
    genReqId: () => crypto.randomUUID(),
  });

  // ── Security plugins ──────────────────────────────────────────────────────
  await app.register(helmet as unknown as Parameters<typeof app.register>[0], {
    contentSecurityPolicy: false,
  });
  await app.register(cors as unknown as Parameters<typeof app.register>[0], {
    origin: process.env["NODE_ENV"] === "production"
      ? ["https://app.ecompilot.pl", "https://ecompilot.pl"]
      : true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });
  await app.register(rateLimit as unknown as Parameters<typeof app.register>[0], {
    max: 200,
    timeWindow: "1 minute",
  });

  // ── Auth middleware ─────────────────────────────────────────────────────────
  await app.register(createAuthPlugin({
    jwtPublicKey: process.env["JWT_PUBLIC_KEY"],
    jwtSecret: process.env["JWT_SECRET"],
    allowInternalHeaders: true,
    internalServiceSecret: process.env["INTERNAL_SERVICE_SECRET"] ?? "true",
  }) as unknown as Parameters<typeof app.register>[0]);

  app.addHook("onRequest", async (request) => {
    logger.info({
      reqId: request.id,
      method: request.method,
      url: request.url,
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

  app.get("/health", async (): Promise<HealthCheckResponse> => {
    return {
      status: "healthy",
      service: SERVICE_NAME,
      version: process.env["npm_package_version"] ?? "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      dependencies: [],
    };
  });

  app.get("/ready", async (): Promise<ReadinessCheckResponse> => {
    return {
      ready: true,
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
    };
  });

  // ── Legal API routes ─────────────────────────────────────────────────────────
  await app.register(legalRoutes);
  logger.info("Legal routes registered");

  onShutdown({
    description: "Fastify HTTP server",
    cleanup: async () => {
      await app.close();
    },
  });

  onShutdown({
    description: "PostgreSQL connection pool",
    cleanup: async () => {
      await closeDb();
    },
  });

  onShutdown({
    description: "OpenTelemetry SDK",
    cleanup: async () => {
      await telemetry.shutdown();
    },
  });

  registerGracefulShutdown(logger);

  await app.listen({ port: PORT, host: HOST });
  logger.info({ port: PORT, host: HOST, service: SERVICE_NAME }, "Service started");
}

bootstrap().catch((err: unknown) => {
  logger.fatal({ err }, "Failed to start service");
  process.exit(1);
});
