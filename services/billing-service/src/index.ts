// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — billing-service
// Subscription billing and plan management via Stripe
// ─────────────────────────────────────────────────────────────────────────────

// Telemetry MUST be initialized before any other import (OTel instrumentation)
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

const telemetry = initTelemetry({ serviceName: "billing-service" });
const logger = createLogger({ service: "billing-service" });

import Fastify from "fastify";
import rawBody from "fastify-raw-body";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { createAuthPlugin } from "@ecompilot/shared-auth";

import { env } from "./config/env.js";
import { initDb, closeDb } from "./db/client.js";
import { initNatsPublisher } from "./services/nats.publisher.js";
import { webhookRoutes } from "./routes/webhook.routes.js";
import { billingRoutes } from "./routes/billing.routes.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = "billing-service" as const;
const START_TIME = Date.now();

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // ── 1. Database ─────────────────────────────────────────────────────────────
  const db = initDb();
  logger.info("PostgreSQL connection pool initialized");

  // ── 2. NATS JetStream publisher ─────────────────────────────────────────────
  const publisher = initNatsPublisher(logger);
  await publisher.connect();

  // ── 3. Fastify ──────────────────────────────────────────────────────────────
  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdLogLabel: "reqId",
    genReqId: () => crypto.randomUUID(),
  });

  // ── 4a. Security & middleware plugins ────────────────────────────────────────
  await app.register(helmet as unknown as Parameters<typeof app.register>[0], {
    contentSecurityPolicy: false,
  });
  await app.register(cors as unknown as Parameters<typeof app.register>[0], {
    origin: env.NODE_ENV === "production" ? false : true,
    methods: ["GET", "POST", "PUT", "DELETE"],
  });
  await app.register(rateLimit as unknown as Parameters<typeof app.register>[0], {
    max: 200,
    timeWindow: "1 minute",
    errorResponseBuilder: (_req: unknown, context: { after: string }) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: `Rate limit exceeded. Retry after ${String(context.after)}.`,
    }),
  });

  // ── 4b. Auth middleware ────────────────────────────────────────────────────────
  await app.register(createAuthPlugin({
    jwtPublicKey: process.env["JWT_PUBLIC_KEY"],
    jwtSecret: process.env["JWT_SECRET"],
    allowInternalHeaders: true,
    internalServiceSecret: process.env["INTERNAL_SERVICE_SECRET"] ?? "true",
  }) as unknown as Parameters<typeof app.register>[0]);

  // ── 4c. rawBody plugin (required for Stripe webhook signature verification) ──
  // Must be registered BEFORE routes — attaches request.rawBody for all routes
  // that opt in via config: { rawBody: true }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(rawBody as any, {
    field: "rawBody",
    global: false,      // opt-in per-route via config.rawBody = true
    encoding: false,    // keep as Buffer (required by stripe.webhooks.constructEvent)
    runFirst: true,     // parse before body parser runs
  });

  // ── 5. Request / response hooks ─────────────────────────────────────────────
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

  // ── 6. Health & readiness endpoints ─────────────────────────────────────────
  app.get("/health", async (): Promise<HealthCheckResponse> => {
    return {
      status: "healthy",
      service: SERVICE_NAME,
      version: process.env["npm_package_version"] ?? "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      dependencies: [
        {
          name: "postgresql",
          // Lightweight liveness check — actual connectivity confirmed at startup
          status: db !== null ? "up" : "down",
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

  // ── 7. Billing routes ────────────────────────────────────────────────────────
  //
  // Webhook route — no JWT, Stripe signature only, rawBody required
  await app.register(webhookRoutes, { publisher, logger });

  // Billing REST routes — JWT-authenticated (enforced by API Gateway or
  // fastify-jwt plugin; request.user is expected to be set by auth middleware)
  await app.register(billingRoutes, { publisher, logger });

  // ── 8. Graceful shutdown ─────────────────────────────────────────────────────
  onShutdown({
    description: "Fastify HTTP server",
    cleanup: async () => {
      await app.close();
    },
  });

  onShutdown({
    description: "NATS JetStream publisher",
    cleanup: async () => {
      await publisher.close();
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

  // ── 9. Start listening ───────────────────────────────────────────────────────
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
