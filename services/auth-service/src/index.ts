// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — auth-service
// Authentication & Authorization (JWT RS256, OAuth2, sessions)
// ─────────────────────────────────────────────────────────────────────────────

import {
  initTelemetry,
  createLogger,
  registerGracefulShutdown,
  onShutdown,
} from "@ecompilot/shared-observability";
import type { HealthCheckResponse, ReadinessCheckResponse } from "@ecompilot/shared-types";

// Telemetry MUST be initialized before Fastify import
const telemetry = initTelemetry({ serviceName: "auth-service" });
const logger = createLogger({ service: "auth-service" });

import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";

import { env, getAllowedOrigins } from "./config/env.js";
import { initDb, closeDb } from "./db/client.js";
import { connectRedis, closeRedis } from "./services/redis.service.js";
import { connectNats, closeNats } from "./services/nats.service.js";
import { authRoutes } from "./routes/auth.routes.js";
import { oauthRoutes } from "./routes/oauth.routes.js";
import { integrationsRoutes } from "./routes/integrations.routes.js";

const SERVICE_NAME = "auth-service" as const;
const START_TIME = Date.now();

async function bootstrap(): Promise<void> {
  // ── Initialize infrastructure ──────────────────────────────────────────────
  const db = initDb();
  logger.info("Database connection pool initialized");

  const redis = await connectRedis(logger);
  logger.info("Redis connected");

  // NATS is best-effort at startup — service can run without it
  try {
    await connectNats(logger);
  } catch (err) {
    logger.warn({ err }, "NATS connection failed at startup — events will not be published");
  }

  // ── Fastify setup ──────────────────────────────────────────────────────────
  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdLogLabel: "reqId",
    genReqId: () => crypto.randomUUID(),
  });

  // ── Health endpoints (registered BEFORE plugins and auth middleware) ────────
  // These must be the very first routes registered on the app so that no
  // authentication hook, CORS pre-flight redirect, or any other plugin can
  // intercept them and return a 302/401 instead of 200.
  app.get("/health", async (): Promise<HealthCheckResponse> => {
    // Probe Redis
    let redisStatus: "up" | "down" = "down";
    let redisLatency: number | undefined;
    try {
      const t0 = Date.now();
      await redis.ping();
      redisLatency = Date.now() - t0;
      redisStatus = "up";
    } catch {
      redisStatus = "down";
    }

    return {
      status: redisStatus === "up" ? "healthy" : "degraded",
      service: SERVICE_NAME,
      version: process.env["npm_package_version"] ?? "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      dependencies: [
        {
          name: "redis",
          status: redisStatus,
          ...(redisLatency !== undefined ? { latencyMs: redisLatency } : {}),
        },
      ],
    };
  });

  app.get("/ready", async (): Promise<ReadinessCheckResponse> => {
    return {
      ready: true,
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
    };
  });

  // ── Plugins ────────────────────────────────────────────────────────────────
  // @fastify/helmet and @fastify/cors declare FastifyTypeProviderDefault but
  // app.register is generic over the app's TypeProvider. Cast via any to bypass
  // the invariant mismatch without losing option-level type checking.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(helmet as any, {
    contentSecurityPolicy: false, // API service — no HTML
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(cors as any, {
    origin: getAllowedOrigins(),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  });

  // ── Request logging ────────────────────────────────────────────────────────
  app.addHook("onRequest", async (request) => {
    logger.info(
      {
        reqId: request.id,
        method: request.method,
        url: request.url,
        ip: request.ip,
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

  // ── Error handler ──────────────────────────────────────────────────────────
  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    logger.error(
      { err: error, reqId: request.id, url: request.url },
      "Unhandled route error",
    );

    const statusCode = error.statusCode ?? 500;

    await reply.status(statusCode).send({
      success: false,
      error: {
        code: statusCode >= 500 ? "INTERNAL_ERROR" : "INVALID_INPUT",
        message:
          statusCode >= 500
            ? "An internal error occurred"
            : (error.message ?? "Bad request"),
        timestamp: new Date().toISOString(),
      },
    });
  });

  // ── Auth routes ────────────────────────────────────────────────────────────
  await authRoutes(app, { logger });
  await oauthRoutes(app, { logger });
  await integrationsRoutes(app, { logger });

  // ── Graceful shutdown handlers ─────────────────────────────────────────────
  onShutdown({
    description: "Fastify HTTP server",
    cleanup: async () => {
      await app.close();
    },
  });

  onShutdown({
    description: "NATS JetStream",
    cleanup: async () => {
      await closeNats(logger);
    },
  });

  onShutdown({
    description: "Redis",
    cleanup: async () => {
      await closeRedis(logger);
    },
  });

  onShutdown({
    description: "PostgreSQL pool",
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

  // ── Start server ───────────────────────────────────────────────────────────
  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info({ port: env.PORT, host: env.HOST, service: SERVICE_NAME }, "Service started");

  // Unused variable suppression — db is used via getDb() in route handlers
  void db;
}

bootstrap().catch((err: unknown) => {
  logger.fatal({ err }, "Failed to start service");
  process.exit(1);
});
