// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — api-gateway / index.ts
// Gateway side-car service: health aggregation, Prometheus metrics scrape,
// CORS pre-flight, and diagnostic endpoints.
//
// Note: All traffic routing is handled by Kong. This process exists to provide:
//   GET /health          — liveness  (used by Kong / k8s)
//   GET /ready           — readiness (used by k8s)
//   GET /metrics         — Prometheus text-format metrics mirror
//   GET /api/v1/status   — aggregated status of all 16 downstream services
// ─────────────────────────────────────────────────────────────────────────────

import { initTelemetry, createLogger, registerGracefulShutdown, onShutdown } from "@ecompilot/shared-observability";
import type { HealthCheckResponse, ReadinessCheckResponse } from "@ecompilot/shared-types";
import { registerHealthAggregator } from "./health.js";

// Telemetry must be initialized before any framework import.
const telemetry = initTelemetry({ serviceName: "api-gateway" });
const logger = createLogger({ service: "api-gateway" });

import Fastify, { type FastifyInstance, type FastifyError } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = "api-gateway" as const;
const PORT = Number(process.env["PORT"] ?? 3000);
const HOST = process.env["HOST"] ?? "0.0.0.0";
const START_TIME = Date.now();

const CORS_ORIGINS = [
  "https://ecompilot.com",
  "https://app.ecompilot.com",
  "http://localhost:3000",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Metrics helpers
// ─────────────────────────────────────────────────────────────────────────────

interface RequestCounters {
  total: number;
  byMethod: Record<string, number>;
  byStatus: Record<string, number>;
  errors4xx: number;
  errors5xx: number;
}

const counters: RequestCounters = {
  total: 0,
  byMethod: {},
  byStatus: {},
  errors4xx: 0,
  errors5xx: 0,
};

function incrementCounter(method: string, statusCode: number): void {
  counters.total++;
  counters.byMethod[method] = (counters.byMethod[method] ?? 0) + 1;
  const statusKey = statusCode.toString();
  counters.byStatus[statusKey] = (counters.byStatus[statusKey] ?? 0) + 1;
  if (statusCode >= 400 && statusCode < 500) {
    counters.errors4xx++;
  } else if (statusCode >= 500) {
    counters.errors5xx++;
  }
}

/**
 * Serialises collected metrics to Prometheus text exposition format.
 * Excludes /metrics and /health from counters to avoid self-noise.
 */
function buildPrometheusOutput(): string {
  const lines: string[] = [];
  const ts = Date.now();

  lines.push("# HELP ecompilot_gateway_requests_total Total HTTP requests handled by the gateway sidecar");
  lines.push("# TYPE ecompilot_gateway_requests_total counter");
  lines.push(`ecompilot_gateway_requests_total ${counters.total.toString()} ${ts.toString()}`);

  lines.push("# HELP ecompilot_gateway_requests_by_method Requests grouped by HTTP method");
  lines.push("# TYPE ecompilot_gateway_requests_by_method counter");
  for (const [method, count] of Object.entries(counters.byMethod)) {
    lines.push(`ecompilot_gateway_requests_by_method{method="${method}"} ${count.toString()} ${ts.toString()}`);
  }

  lines.push("# HELP ecompilot_gateway_requests_by_status Requests grouped by HTTP status code");
  lines.push("# TYPE ecompilot_gateway_requests_by_status counter");
  for (const [status, count] of Object.entries(counters.byStatus)) {
    lines.push(`ecompilot_gateway_requests_by_status{status="${status}"} ${count.toString()} ${ts.toString()}`);
  }

  lines.push("# HELP ecompilot_gateway_errors_4xx_total 4xx error responses");
  lines.push("# TYPE ecompilot_gateway_errors_4xx_total counter");
  lines.push(`ecompilot_gateway_errors_4xx_total ${counters.errors4xx.toString()} ${ts.toString()}`);

  lines.push("# HELP ecompilot_gateway_errors_5xx_total 5xx error responses");
  lines.push("# TYPE ecompilot_gateway_errors_5xx_total counter");
  lines.push(`ecompilot_gateway_errors_5xx_total ${counters.errors5xx.toString()} ${ts.toString()}`);

  lines.push("# HELP ecompilot_gateway_uptime_seconds Seconds since the gateway process started");
  lines.push("# TYPE ecompilot_gateway_uptime_seconds gauge");
  const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1_000);
  lines.push(`ecompilot_gateway_uptime_seconds ${uptimeSeconds.toString()} ${ts.toString()}`);

  lines.push("# HELP ecompilot_gateway_nodejs_memory_heap_used_bytes Node.js heap used");
  lines.push("# TYPE ecompilot_gateway_nodejs_memory_heap_used_bytes gauge");
  const mem = process.memoryUsage();
  lines.push(`ecompilot_gateway_nodejs_memory_heap_used_bytes ${mem.heapUsed.toString()} ${ts.toString()}`);

  lines.push("# HELP ecompilot_gateway_nodejs_memory_rss_bytes Node.js RSS");
  lines.push("# TYPE ecompilot_gateway_nodejs_memory_rss_bytes gauge");
  lines.push(`ecompilot_gateway_nodejs_memory_rss_bytes ${mem.rss.toString()} ${ts.toString()}`);

  return lines.join("\n") + "\n";
}

// ─────────────────────────────────────────────────────────────────────────────
// Register hooks
// ─────────────────────────────────────────────────────────────────────────────

function registerHooks(app: FastifyInstance): void {
  app.addHook("onRequest", async (request) => {
    logger.info(
      {
        reqId: request.id,
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers["user-agent"],
      },
      "Incoming request",
    );
  });

  app.addHook("onResponse", async (request, reply) => {
    const isNoisyPath =
      request.url === "/health" ||
      request.url === "/ready" ||
      request.url === "/metrics";

    if (!isNoisyPath) {
      incrementCounter(request.method, reply.statusCode);
    }

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

  // setErrorHandler's TError defaults to unknown; we narrow to FastifyError
  // which carries .statusCode and .message.
  app.setErrorHandler<FastifyError>(async (error, request, reply) => {
    logger.error(
      {
        reqId: request.id,
        method: request.method,
        url: request.url,
        err: error,
      },
      "Unhandled request error",
    );

    const statusCode: number =
      typeof error.statusCode === "number" ? error.statusCode : 500;

    const message: string =
      process.env["NODE_ENV"] === "production"
        ? "An unexpected error occurred."
        : error.message;

    return reply.code(statusCode).send({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message,
        timestamp: new Date().toISOString(),
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Register routes
// ─────────────────────────────────────────────────────────────────────────────

function registerRoutes(app: FastifyInstance): void {
  // ── Liveness ────────────────────────────────────────────────────────────────
  app.get("/health", async (): Promise<HealthCheckResponse> => {
    return {
      status: "healthy",
      service: SERVICE_NAME,
      version: process.env["npm_package_version"] ?? "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1_000),
      dependencies: [],
    };
  });

  // ── Readiness ───────────────────────────────────────────────────────────────
  app.get("/ready", async (): Promise<ReadinessCheckResponse> => {
    return {
      ready: true,
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
    };
  });

  // ── Prometheus metrics scrape endpoint ──────────────────────────────────────
  // Kong's Prometheus plugin exposes its own metrics on :8001/metrics.
  // This endpoint exposes gateway-sidecar-level metrics for local scraping.
  app.get("/metrics", async (_request, reply) => {
    const output = buildPrometheusOutput();
    return reply
      .code(200)
      .header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
      .send(output);
  });

  // ── Aggregated downstream status ────────────────────────────────────────────
  registerHealthAggregator(app, { startTime: START_TIME, logger });
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdLogLabel: "reqId",
    genReqId: () => crypto.randomUUID(),
  });

  // ── Security headers ────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(helmet as any, {
    contentSecurityPolicy: false, // Kong handles CSP for browser clients
    crossOriginEmbedderPolicy: false,
  });

  // ── CORS ────────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(cors as any, {
    origin: (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
      if (origin === undefined || origin === null) {
        // Server-to-server / Kong internal calls
        cb(null, true);
        return;
      }
      const allowed = (CORS_ORIGINS as readonly string[]).includes(origin);
      cb(allowed ? null : new Error("CORS: Origin not allowed"), allowed);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allowedHeaders: [
      "Accept",
      "Accept-Language",
      "Authorization",
      "Content-Type",
      "X-Request-Id",
      "X-User-ID",
      "X-User-Plan",
      "X-User-Language",
    ],
    exposedHeaders: [
      "X-Request-Id",
      "X-Plan-Limit",
      "X-Plan-Used",
      "X-Plan-Remaining",
    ],
    credentials: true,
    maxAge: 3600,
  });

  registerHooks(app);
  registerRoutes(app);

  // ── Graceful shutdown ────────────────────────────────────────────────────────
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

  await app.listen({ port: PORT, host: HOST });

  logger.info(
    { port: PORT, host: HOST, service: SERVICE_NAME },
    "Service started",
  );
}

bootstrap().catch((err: unknown) => {
  logger.fatal({ err }, "Failed to start service");
  process.exit(1);
});
