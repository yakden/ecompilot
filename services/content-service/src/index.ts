// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — content-service
// Product content management and optimization
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

const telemetry = initTelemetry({ serviceName: "content-service" });
const logger = createLogger({ service: "content-service" });

import Fastify from "fastify";
import multipart from "@fastify/multipart";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { FastifyCorsOptions } from "@fastify/cors";
import type { RateLimitPluginOptions } from "@fastify/rate-limit";

import { sql } from "drizzle-orm";
import { env } from "./config/env.js";
import { createAuthPlugin } from "@ecompilot/shared-auth";
import { closeDatabaseConnection, getDatabase } from "./db/client.js";
import { closeNatsConnection, getNatsConnection } from "./services/nats.service.js";
import { closeRedisClient } from "./services/redis.client.js";
import { contentRoutes } from "./routes/content.routes.js";
import {
  createThumbnailWorker,
  createDescriptionWorker,
} from "./workers/content.worker.js";

const SERVICE_NAME = "content-service" as const;
const START_TIME = Date.now();

async function bootstrap(): Promise<void> {
  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdLogLabel: "reqId",
    genReqId: () => crypto.randomUUID(),
    // Increase body limit for base64-embedded payloads on sync endpoints
    bodyLimit: 15 * 1024 * 1024, // 15 MB
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
    max: 200,
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
  // Multipart file upload support (@fastify/multipart)
  // Used by /generate-thumbnail and /remove-background endpoints
  // ─────────────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (app.register as any)(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB per file
      files: 1,                    // single file per request
      fieldSize: 1024,             // prompt field max 1 KB
      fields: 5,                   // max non-file fields
    },
    attachFieldsToBody: false,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Request / response logging hooks
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
  // Health & Readiness endpoints
  // ─────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  // Auth middleware
  // ─────────────────────────────────────────────────────────────────────────
  await app.register(createAuthPlugin({
    jwtPublicKey: process.env["JWT_PUBLIC_KEY"],
    jwtSecret: process.env["JWT_SECRET"],
    allowInternalHeaders: true,
    internalServiceSecret: process.env["INTERNAL_SERVICE_SECRET"] ?? "true",
  }) as unknown as Parameters<typeof app.register>[0]);

  // ─────────────────────────────────────────────────────────────────────────
  // Domain routes
  // ─────────────────────────────────────────────────────────────────────────
  await app.register(contentRoutes);

  // ─────────────────────────────────────────────────────────────────────────
  // BullMQ workers
  // Started after the HTTP server registers routes; failures here are logged
  // but do not prevent the HTTP server from starting.
  // ─────────────────────────────────────────────────────────────────────────
  const thumbnailWorker = createThumbnailWorker();
  const descriptionWorker = createDescriptionWorker();

  logger.info("BullMQ workers started: thumbnail-generation, description-generation");

  // ─────────────────────────────────────────────────────────────────────────
  // Graceful shutdown handlers (LIFO — last registered runs first)
  // ─────────────────────────────────────────────────────────────────────────
  onShutdown({
    description: "OpenTelemetry SDK",
    cleanup: async () => {
      await telemetry.shutdown();
    },
  });

  onShutdown({
    description: "NATS JetStream connection",
    cleanup: async () => {
      await closeNatsConnection();
    },
  });

  onShutdown({
    description: "PostgreSQL connection pool",
    cleanup: async () => {
      await closeDatabaseConnection();
    },
  });

  onShutdown({
    description: "Redis client (product data cache)",
    cleanup: async () => {
      await closeRedisClient();
    },
  });

  onShutdown({
    description: "BullMQ workers",
    cleanup: async () => {
      await Promise.all([
        thumbnailWorker.close(),
        descriptionWorker.close(),
      ]);
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
  // Pre-flight: verify DB connectivity before accepting traffic
  // ─────────────────────────────────────────────────────────────────────────
  try {
    const db = getDatabase();
    await db.execute(sql`SELECT 1`);
    logger.info("PostgreSQL connection verified");
  } catch (err) {
    logger.error({ err }, "PostgreSQL pre-flight check failed");
    // Non-fatal at startup — pg pool will retry connections
  }

  // Pre-warm NATS connection (non-fatal)
  try {
    await getNatsConnection();
  } catch (err) {
    logger.warn({ err }, "NATS pre-flight connection failed — will retry");
  }

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  logger.info(
    { port: env.PORT, host: "0.0.0.0", service: SERVICE_NAME },
    "Service started",
  );
}

bootstrap().catch((err: unknown) => {
  logger.fatal({ err }, "Failed to start service");
  process.exit(1);
});
