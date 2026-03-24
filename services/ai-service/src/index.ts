// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — ai-service
// GPT-4o RAG-powered chat assistant for Polish marketplace sellers
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

// Telemetry must be initialized before any other imports
const telemetry = initTelemetry({ serviceName: "ai-service" });
const logger = createLogger({ service: "ai-service" });

import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { FastifyCorsOptions } from "@fastify/cors";
import type { RateLimitPluginOptions } from "@fastify/rate-limit";
import { Redis } from "ioredis";
import { connect as natsConnect, type NatsConnection } from "nats";

import { env } from "./config/env.js";
import { checkDbConnection, closeDb } from "./db/client.js";
import { RagService } from "./services/rag.service.js";
import { ChatService } from "./services/chat.service.js";
import { registerChatRoutes } from "./routes/chat.routes.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = "ai-service" as const;
const HOST = process.env["HOST"] ?? "0.0.0.0";
const START_TIME = Date.now();

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // ── Infrastructure clients ────────────────────────────────────────────────

  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    connectTimeout: 5_000,
    retryStrategy: (times) => {
      if (times > 10) return null; // stop retrying
      return Math.min(times * 200, 2000);
    },
  });

  await redis.connect();
  logger.info("Redis connected");

  let nats: NatsConnection | null = null;
  try {
    nats = await natsConnect({ servers: env.NATS_URL });
    logger.info({ url: env.NATS_URL }, "NATS connected");
  } catch (err) {
    // NATS is non-critical for chat — log and continue
    logger.warn({ err }, "NATS connection failed — continuing without NATS");
  }

  // ── AI services ──────────────────────────────────────────────────────────

  const ragService = new RagService(logger);
  const chatService = new ChatService(logger, ragService);

  // ── Fastify app ───────────────────────────────────────────────────────────

  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdLogLabel: "reqId",
    genReqId: () => crypto.randomUUID(),
    // Allow larger bodies for store analysis requests
    bodyLimit: 1_048_576, // 1 MB
  });

  // ── Security plugins ──────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (app.register as any)(helmet, {
    contentSecurityPolicy: false, // SSE requires relaxed CSP
    crossOriginEmbedderPolicy: false,
  });

  const corsOptions: FastifyCorsOptions = {
    origin: process.env["CORS_ORIGIN"] ?? true,
    credentials: true,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (app.register as any)(cors, corsOptions);

  const rateLimitOptions: RateLimitPluginOptions = {
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (request) =>
      (request.headers["x-forwarded-for"] as string | undefined) ??
      request.ip,
    errorResponseBuilder: (_request, context) => ({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: `Rate limit exceeded. Retry after ${context.after}.`,
        details: { retryAfter: context.after },
        timestamp: new Date().toISOString(),
      },
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (app.register as any)(rateLimit, rateLimitOptions);

  // ── Request/response logging hooks ───────────────────────────────────────

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

  // ── Health & readiness ────────────────────────────────────────────────────

  app.get("/health", async (): Promise<HealthCheckResponse> => {
    const dbLatency = await measureLatency(() => checkDbConnection());
    const redisLatency = await measureLatency(() => redis.ping());
    const pineconeOk = await ragService.ping();

    const dependencies = [
      {
        name: "postgresql",
        status: dbLatency.ok ? ("up" as const) : ("down" as const),
        ...(dbLatency.latencyMs !== undefined
          ? { latencyMs: dbLatency.latencyMs }
          : {}),
      },
      {
        name: "redis",
        status: redisLatency.ok ? ("up" as const) : ("down" as const),
        ...(redisLatency.latencyMs !== undefined
          ? { latencyMs: redisLatency.latencyMs }
          : {}),
      },
      {
        name: "pinecone",
        status: pineconeOk ? ("up" as const) : ("down" as const),
      },
      {
        name: "nats",
        status: nats !== null ? ("up" as const) : ("unknown" as const),
      },
    ];

    const allUp = dependencies.every((d) => d.status !== "down");

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
    return {
      ready: true,
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
    };
  });

  // ── Chat routes ───────────────────────────────────────────────────────────

  await registerChatRoutes(app, {
    redis,
    chatService,
    ragService,
    logger,
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────

  onShutdown({
    description: "Fastify HTTP server",
    cleanup: async () => {
      await app.close();
    },
  });

  onShutdown({
    description: "Redis connection",
    cleanup: async () => {
      await redis.quit();
    },
  });

  onShutdown({
    description: "NATS connection",
    cleanup: async () => {
      if (nats !== null) {
        await nats.close();
      }
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
  logger.info(
    { port: env.PORT, host: HOST, service: SERVICE_NAME },
    "AI Service started",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Latency helper for health check
// ─────────────────────────────────────────────────────────────────────────────

async function measureLatency(
  fn: () => Promise<unknown>,
): Promise<{ ok: boolean; latencyMs?: number }> {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

bootstrap().catch((err: unknown) => {
  logger.fatal({ err }, "Failed to start AI service");
  process.exit(1);
});
