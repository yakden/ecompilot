// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — notification-service
// Multi-channel notifications (email, push, in-app)
// ─────────────────────────────────────────────────────────────────────────────

import { initTelemetry, createLogger, registerGracefulShutdown, onShutdown } from "@ecompilot/shared-observability";
import type { HealthCheckResponse, ReadinessCheckResponse, DependencyHealth } from "@ecompilot/shared-types";

const telemetry = initTelemetry({ serviceName: "notification-service" });
const logger = createLogger({ service: "notification-service" });

import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "node:http";

import { env } from "./config/env.js";
import { createAuthPlugin, verifySocketToken, type AuthMiddlewareConfig } from "@ecompilot/shared-auth";
import { initDb, closeDb } from "./db/client.js";
import { connectRedis, closeRedis } from "./services/redis.service.js";
import { connectNats, closeNats } from "./services/nats.service.js";
import { initFirebase } from "./services/push.service.js";
import { setSocketServer } from "./services/inapp.service.js";
import { startEventSubscribers } from "./subscribers/event.subscriber.js";
import { notificationRoutes } from "./routes/notification.routes.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = "notification-service" as const;
const START_TIME = Date.now();

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // ── 1. Infrastructure connections ────────────────────────────────────────

  initDb();
  await connectRedis(logger);
  await connectNats(logger);
  initFirebase();

  // ── 2. Fastify app ───────────────────────────────────────────────────────

  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdLogLabel: "reqId",
    genReqId: () => crypto.randomUUID(),
  });

  // ── 3. Plugins ───────────────────────────────────────────────────────────

  await app.register(helmet as unknown as Parameters<typeof app.register>[0], {
    contentSecurityPolicy: false,
  });

  await app.register(cors as unknown as Parameters<typeof app.register>[0], {
    origin: (process.env["ALLOWED_ORIGINS"] ?? "").split(",").filter(Boolean),
    credentials: true,
  });

  await app.register(rateLimit as unknown as Parameters<typeof app.register>[0], {
    max: 200,
    timeWindow: "1 minute",
  });

  // ── 4. Request lifecycle hooks ───────────────────────────────────────────

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

  // ── 5. Health & readiness probes ─────────────────────────────────────────

  app.get("/health", async (): Promise<HealthCheckResponse> => {
    const dependencies: DependencyHealth[] = [
      { name: "postgresql", status: "up" },
      { name: "redis", status: "up" },
      { name: "nats", status: "up" },
      { name: "firebase", status: "up" },
    ];

    return {
      status: "healthy",
      service: SERVICE_NAME,
      version: process.env["npm_package_version"] ?? "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1_000),
      dependencies,
    };
  });

  app.get("/ready", async (): Promise<ReadinessCheckResponse> => {
    return {
      ready: true,
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
    };
  });

  // ── 6a. Auth middleware ──────────────────────────────────────────────────

  const authConfig: AuthMiddlewareConfig = {
    jwtPublicKey: process.env["JWT_PUBLIC_KEY"],
    jwtSecret: process.env["JWT_SECRET"],
    allowInternalHeaders: true,
    internalServiceSecret: process.env["INTERNAL_SERVICE_SECRET"] ?? "true",
  };

  await app.register(createAuthPlugin(authConfig) as unknown as Parameters<typeof app.register>[0]);

  // ── 6b. API routes ────────────────────────────────────────────────────────

  await app.register(notificationRoutes, { prefix: "/api/v1/notifications" });

  // ── 7. Socket.io for real-time in-app delivery ───────────────────────────

  await app.listen({ port: env.PORT, host: process.env["HOST"] ?? "0.0.0.0" });

  const io = new SocketIOServer(app.server as HttpServer, {
    cors: {
      origin: (process.env["ALLOWED_ORIGINS"] ?? "").split(",").filter(Boolean),
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // ── Socket.io JWT authentication middleware ──────────────────────────────
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.["token"] as string | undefined;
    if (!token) {
      return next(new Error("Authentication required"));
    }
    try {
      const user = await verifySocketToken(token, authConfig);
      socket.data["userId"] = user.sub;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data["userId"] as string | undefined;
    if (typeof userId === "string" && userId.length > 0) {
      void socket.join(`user:${userId}`);
      logger.info({ userId, socketId: socket.id }, "Socket.io client connected");

      socket.on("disconnect", (reason) => {
        logger.info({ userId, socketId: socket.id, reason }, "Socket.io client disconnected");
      });
    } else {
      logger.warn({ socketId: socket.id }, "Socket.io connection without valid userId -- disconnecting");
      socket.disconnect(true);
    }
  });

  setSocketServer(io);

  // ── 8. NATS JetStream subscribers ────────────────────────────────────────

  await startEventSubscribers(logger);

  // ── 9. Graceful shutdown ─────────────────────────────────────────────────

  onShutdown({
    description: "Socket.io server",
    cleanup: async () => {
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  });

  onShutdown({
    description: "Fastify HTTP server",
    cleanup: async () => {
      await app.close();
    },
  });

  onShutdown({
    description: "NATS connection",
    cleanup: async () => {
      await closeNats(logger);
    },
  });

  onShutdown({
    description: "Redis connection",
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

  logger.info(
    { port: env.PORT, service: SERVICE_NAME },
    "Service started",
  );
}

bootstrap().catch((err: unknown) => {
  logger.fatal({ err }, "Failed to start service");
  process.exit(1);
});
