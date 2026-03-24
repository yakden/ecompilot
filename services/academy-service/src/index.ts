// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — academy-service
// Learning management system: courses, video lessons, progress, certificates
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
const telemetry = initTelemetry({ serviceName: "academy-service" });
const logger = createLogger({ service: "academy-service" });

import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";

import { env } from "./config/env.js";
import { checkDbConnection, closeDb } from "./db/client.js";
import { VideoService } from "./services/video.service.js";
import { CertificateService } from "./services/certificate.service.js";
import { registerAcademyRoutes } from "./routes/academy.routes.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = "academy-service" as const;
const HOST = process.env["HOST"] ?? "0.0.0.0";
const START_TIME = Date.now();

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // ── Domain services ───────────────────────────────────────────────────────

  const videoService = new VideoService(logger);
  const certificateService = new CertificateService(logger);

  // ── Fastify app ───────────────────────────────────────────────────────────

  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdLogLabel: "reqId",
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 262_144, // 256 KB
  });

  // ── Security plugins ──────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(helmet as any, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(cors as any, {
    origin: process.env["CORS_ORIGIN"] ?? true,
    credentials: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(rateLimit as any, {
    max: 200,
    timeWindow: "1 minute",
    keyGenerator: (request: { headers: Record<string, string | string[] | undefined>; ip: string }) =>
      (request.headers["x-forwarded-for"] as string | undefined) ??
      request.ip,
    errorResponseBuilder: (_request: unknown, context: { after: string }) => ({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: `Rate limit exceeded. Retry after ${context.after}.`,
        details: { retryAfter: context.after },
        timestamp: new Date().toISOString(),
      },
    }),
  });

  // ── Request/response logging hooks ────────────────────────────────────────

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

  // ── Health & readiness ─────────────────────────────────────────────────────

  app.get("/health", async (): Promise<HealthCheckResponse> => {
    const dbResult = await measureLatency(() => checkDbConnection());

    const dependencies = [
      {
        name: "postgresql",
        status: dbResult.ok ? ("up" as const) : ("down" as const),
        ...(dbResult.latencyMs !== undefined
          ? { latencyMs: dbResult.latencyMs }
          : {}),
      },
    ];

    return {
      status: dbResult.ok ? "healthy" : "degraded",
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

  // ── Academy routes ─────────────────────────────────────────────────────────

  await registerAcademyRoutes(app, {
    videoService,
    certificateService,
    logger,
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────

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

  // ── Start listening ────────────────────────────────────────────────────────

  await app.listen({ port: env.PORT, host: HOST });
  logger.info(
    { port: env.PORT, host: HOST, service: SERVICE_NAME },
    "Academy Service started",
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
  logger.fatal({ err }, "Failed to start Academy Service");
  process.exit(1);
});
