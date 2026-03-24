// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — suppliers-service
// Supplier discovery and management service
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
  DependencyHealth,
} from "@ecompilot/shared-types";

// Env must be validated before any other imports that depend on it
import { env } from "./config/env.js";

const telemetry = initTelemetry({ serviceName: "suppliers-service" });
const logger = createLogger({ service: "suppliers-service" });

import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";

import { pool, pingDatabase } from "./db/client.js";
import { pingElasticsearch, ensureIndex, syncAll } from "./services/elasticsearch.service.js";
import { connectRedis, closeRedis, getRedis } from "./services/redis.service.js";
import { authMiddleware } from "./middleware/auth.middleware.js";
import suppliersRoutes from "./routes/suppliers.routes.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = "suppliers-service" as const;
const START_TIME = Date.now();

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // ─── Initialize Redis (required for KRS/CEIDG/REGON/VIES caching) ───────
  await connectRedis(logger);
  logger.info("Redis connected");

  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdLogLabel: "reqId",
    genReqId: () => crypto.randomUUID(),
  });

  // ─── Request / response logging ─────────────────────────────────────────
  app.addHook("onRequest", async (request) => {
    logger.info(
      {
        reqId: request.id,
        method: request.method,
        url: request.url,
        userAgent: request.headers["user-agent"],
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

  // ─── Security & rate limiting ────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(helmet as any, {
    contentSecurityPolicy: false,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(cors as any, {
    origin:
      env.NODE_ENV === "production"
        ? ["https://ecompilot.pl", "https://app.ecompilot.pl"]
        : true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Correlation-ID",
      "x-user-id",
      "x-user-plan",
      "x-user-email",
    ],
    credentials: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(rateLimit as any, {
    max: 300,
    timeWindow: "1 minute",
    keyGenerator: (request: { headers: Record<string, string | string[] | undefined>; ip: string }) =>
      (request.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      request.ip,
    errorResponseBuilder: (_request: unknown, context: { after: string }) => ({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: `Too many requests. Please retry after ${String(context.after)}.`,
        timestamp: new Date().toISOString(),
      },
    }),
  });

  // ─── Cookie support (required for partner tracking) ─────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(cookie as any, {
    secret: env.JWT_SECRET,
    parseOptions: {},
  });

  // ─── Auth middleware ─────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(authMiddleware as any);

  // ─── Feature routes ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(suppliersRoutes as any);

  // ─── Health & readiness ──────────────────────────────────────────────────
  app.get("/health", async (): Promise<HealthCheckResponse> => {
    const dependencies: DependencyHealth[] = [];

    // Check PostgreSQL
    const pgStart = Date.now();
    try {
      await pingDatabase();
      dependencies.push({
        name: "postgresql",
        status: "up",
        latencyMs: Date.now() - pgStart,
      });
    } catch (err) {
      dependencies.push({
        name: "postgresql",
        status: "down",
        latencyMs: Date.now() - pgStart,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }

    // Check Elasticsearch
    const esStart = Date.now();
    try {
      await pingElasticsearch();
      dependencies.push({
        name: "elasticsearch",
        status: "up",
        latencyMs: Date.now() - esStart,
      });
    } catch (err) {
      dependencies.push({
        name: "elasticsearch",
        status: "down",
        latencyMs: Date.now() - esStart,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }

    // Check Redis
    const redisStart = Date.now();
    try {
      await getRedis().ping();
      dependencies.push({
        name: "redis",
        status: "up",
        latencyMs: Date.now() - redisStart,
      });
    } catch (err) {
      dependencies.push({
        name: "redis",
        status: "down",
        latencyMs: Date.now() - redisStart,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }

    const allUp = dependencies.every((d) => d.status === "up");

    return {
      status: allUp ? "healthy" : "degraded",
      service: SERVICE_NAME,
      version: process.env["npm_package_version"] ?? "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      dependencies,
    };
  });

  app.get("/ready", async (): Promise<ReadinessCheckResponse> => {
    try {
      await pingDatabase();
      await pingElasticsearch();
      return {
        ready: true,
        service: SERVICE_NAME,
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        ready: false,
        service: SERVICE_NAME,
        timestamp: new Date().toISOString(),
      };
    }
  });

  // ─── 404 handler ─────────────────────────────────────────────────────────
  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
        timestamp: new Date().toISOString(),
      },
    });
  });

  // ─── Global error handler ────────────────────────────────────────────────
  app.setErrorHandler((err, request, reply) => {
    logger.error(
      { err, reqId: request.id, url: request.url },
      "Unhandled route error",
    );
    void reply.code(500).send({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        timestamp: new Date().toISOString(),
      },
    });
  });

  // ─── Graceful shutdown ───────────────────────────────────────────────────
  onShutdown({
    description: "Fastify HTTP server",
    cleanup: async () => {
      await app.close();
    },
  });

  onShutdown({
    description: "PostgreSQL connection pool",
    cleanup: async () => {
      await pool.end();
    },
  });

  onShutdown({
    description: "Redis",
    cleanup: async () => {
      await closeRedis(logger);
    },
  });

  onShutdown({
    description: "OpenTelemetry SDK",
    cleanup: async () => {
      await telemetry.shutdown();
    },
  });

  registerGracefulShutdown(logger);

  // ─── Pre-flight: ensure ES index exists ─────────────────────────────────
  try {
    await ensureIndex();
    logger.info({ index: env.ES_INDEX_SUPPLIERS }, "Elasticsearch index ready");
    // Sync all suppliers from PostgreSQL to Elasticsearch on startup
    try {
      await syncAll();
      logger.info("Elasticsearch synced with PostgreSQL data");
    } catch (syncErr) {
      logger.warn({ err: syncErr }, "ES sync failed — data may be stale");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to ensure Elasticsearch index — will retry on next request");
  }

  // ─── Start listening ─────────────────────────────────────────────────────
  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info(
    { port: env.PORT, host: env.HOST, service: SERVICE_NAME },
    "Service started",
  );
}

bootstrap().catch((err: unknown) => {
  logger.fatal({ err }, "Failed to start service");
  process.exit(1);
});
