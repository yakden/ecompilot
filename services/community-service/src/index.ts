// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — community-service
// Community forum with real-time Socket.io, PostgreSQL FTS, NATS events
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

const telemetry = initTelemetry({ serviceName: "community-service" });
const logger = createLogger({ service: "community-service" });

import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit, { type RateLimitPluginOptions } from "@fastify/rate-limit";
import type { Server as HttpServer } from "node:http";

import { env, getAllowedOrigins } from "./config/env.js";
import { createAuthPlugin } from "@ecompilot/shared-auth";
import { initDb, closeDb, createDbPool } from "./db/client.js";
import { initNatsPublisher, getNatsPublisher } from "./services/nats.publisher.js";
import {
  initSocketIO,
  closeSocketIO,
} from "./services/websocket.service.js";
import { communityRoutes } from "./routes/community.routes.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = "community-service" as const;
const HOST = process.env["HOST"] ?? "0.0.0.0";
const START_TIME = Date.now();

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // ── Database ───────────────────────────────────────────────────────────────
  initDb();
  logger.info("Database pool initialized");

  // ── NATS Publisher ─────────────────────────────────────────────────────────
  const natsPublisher = initNatsPublisher(logger);
  await natsPublisher.connect();

  // ── Fastify ────────────────────────────────────────────────────────────────
  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdLogLabel: "reqId",
    genReqId: () => crypto.randomUUID(),
  });

  // ── Plugins ────────────────────────────────────────────────────────────────
  // Cast plugins to Parameters<typeof app.register>[0] to satisfy Fastify v5
  // TypeProvider variance: plugins are typed against FastifyTypeProviderDefault
  // but register expects the base FastifyTypeProvider interface.
  await app.register(fastifyHelmet as unknown as Parameters<typeof app.register>[0], {
    // Socket.io requires relaxed CSP for upgrades
    contentSecurityPolicy: false,
  });

  await app.register(fastifyCors as unknown as Parameters<typeof app.register>[0], {
    origin: getAllowedOrigins(),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  await app.register(fastifyRateLimit as unknown as Parameters<typeof app.register>[0], {
    max: 200,
    timeWindow: "1 minute",
    errorResponseBuilder: (_request: Parameters<NonNullable<RateLimitPluginOptions["errorResponseBuilder"]>>[0], context: Parameters<NonNullable<RateLimitPluginOptions["errorResponseBuilder"]>>[1]) => ({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: `Rate limit exceeded. Try again in ${String(context.after)}.`,
        timestamp: new Date().toISOString(),
      },
    }),
  });

  // ── Request / Response logging hooks ──────────────────────────────────────
  app.addHook("onRequest", async (request) => {
    logger.info(
      { reqId: request.id, method: request.method, url: request.url },
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

  // ── Health & Readiness ────────────────────────────────────────────────────
  app.get("/health", async (): Promise<HealthCheckResponse> => {
    // Check DB connectivity with a lightweight probe
    let dbStatus: "up" | "down" = "up";
    let dbLatencyMs: number | undefined;
    try {
      const probePool = createDbPool();
      const t0 = Date.now();
      await probePool.query("SELECT 1");
      dbLatencyMs = Date.now() - t0;
      await probePool.end();
    } catch {
      dbStatus = "down";
    }

    return {
      status: dbStatus === "up" ? "healthy" : "degraded",
      service: SERVICE_NAME,
      version: process.env["npm_package_version"] ?? "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      dependencies: [
        {
          name: "postgres",
          status: dbStatus,
          ...(dbLatencyMs !== undefined ? { latencyMs: dbLatencyMs } : {}),
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

  // ── Auth middleware ──────────────────────────────────────────────────────
  await app.register(createAuthPlugin({
    jwtPublicKey: process.env["JWT_PUBLIC_KEY"],
    jwtSecret: process.env["JWT_SECRET"],
    allowInternalHeaders: true,
    internalServiceSecret: process.env["INTERNAL_SERVICE_SECRET"] ?? "true",
  }) as unknown as Parameters<typeof app.register>[0]);

  // ── Community routes ──────────────────────────────────────────────────────
  await app.register(communityRoutes);

  // ── Graceful shutdown hooks ───────────────────────────────────────────────
  onShutdown({
    description: "Socket.io server",
    cleanup: async () => {
      await closeSocketIO(logger);
    },
  });

  onShutdown({
    description: "NATS JetStream",
    cleanup: async () => {
      await getNatsPublisher().close();
    },
  });

  onShutdown({
    description: "Fastify HTTP server",
    cleanup: async () => {
      await app.close();
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

  // ── Start listening ───────────────────────────────────────────────────────
  await app.listen({ port: env.PORT, host: HOST });

  // ── Socket.io — attach to the underlying HTTP server ─────────────────────
  // Fastify exposes the raw Node.js HTTP server after listen()
  const httpServer = app.server as HttpServer;
  initSocketIO(httpServer, logger);

  logger.info(
    { port: env.PORT, host: HOST, service: SERVICE_NAME },
    "Service started",
  );
}

bootstrap().catch((err: unknown) => {
  logger.fatal({ err }, "Failed to start service");
  process.exit(1);
});
