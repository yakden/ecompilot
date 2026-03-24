// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — calc-service
// Profit calculator and pricing engine
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

import Fastify, { type FastifyError } from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";

import { env } from "./config/env.js";
import { createAuthPlugin } from "@ecompilot/shared-auth";
import { calcRoutes } from "./routes/calc.routes.js";
import { closeDb, getPool } from "./db/connection.js";
import { closeGeocodingRedis } from "./services/geocoding.service.js";
import { closeGeoNamesRedis } from "./services/geonames.service.js";

// ─── Telemetry & logger ───────────────────────────────────────────────────────

const telemetry = initTelemetry({ serviceName: "calc-service" });
const logger = createLogger({ service: "calc-service" });

// ─── Constants ────────────────────────────────────────────────────────────────

const SERVICE_NAME = "calc-service" as const;
const START_TIME = Date.now();

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdLogLabel: "reqId",
    genReqId: () => crypto.randomUUID(),
  });

  // ── Security plugins ─────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(helmet as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(cors as any, {
    origin: env.NODE_ENV === "production" ? false : true,
    methods: ["GET", "POST"],
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(rateLimit as any, {
    max: 120,
    timeWindow: "1 minute",
    errorResponseBuilder: (_req: unknown, context: { after: string }) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: `Rate limit exceeded. Retry after ${String(context.after)}.`,
    }),
  });

  // ── Request / response logging ───────────────────────────────────────────
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

  // ── Health / readiness endpoints ─────────────────────────────────────────
  app.get("/health", async (): Promise<HealthCheckResponse> => {
    let dbHealthy = false;
    try {
      const pool = getPool();
      const client = await pool.connect();
      await client.query("SELECT 1");
      client.release();
      dbHealthy = true;
    } catch {
      // DB not reachable — still return 200 with degraded status
    }

    return {
      status: dbHealthy ? "healthy" : "degraded",
      service: SERVICE_NAME,
      version: process.env["npm_package_version"] ?? "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      dependencies: [
        { name: "postgres", status: dbHealthy ? ("up" as const) : ("down" as const) },
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

  // ── Calc routes ───────────────────────────────────────────────────────────
  await app.register(calcRoutes);

  // ── Global error handler ──────────────────────────────────────────────────
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    logger.error(
      { err: error, reqId: request.id, url: request.url },
      "Unhandled request error",
    );

    const statusCode = error.statusCode ?? 500;
    void reply.status(statusCode).send({
      statusCode,
      error: statusCode === 500 ? "Internal Server Error" : error.name,
      message:
        statusCode === 500
          ? "An unexpected error occurred"
          : error.message,
    });
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
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
    description: "Geocoding Redis client",
    cleanup: async () => {
      await closeGeocodingRedis();
    },
  });

  onShutdown({
    description: "GeoNames Redis client",
    cleanup: async () => {
      await closeGeoNamesRedis();
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
