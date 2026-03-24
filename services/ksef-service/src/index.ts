// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — ksef-service
// Polish KSeF e-invoice compliance engine
// Mandatory for all VAT payers from April 1, 2026 (grace period until Jan 1, 2027)
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
  DependencyHealth,
} from "@ecompilot/shared-types";

const telemetry = initTelemetry({ serviceName: "ksef-service" });
const logger = createLogger({ service: "ksef-service" });

import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { createAuthPlugin } from "@ecompilot/shared-auth";

import { env } from "./config/env.js";
import { initDb, closeDb, getDb } from "./db/client.js";
import { InvoiceService } from "./services/invoice.service.js";
import { OfflineService } from "./services/offline.service.js";
import { getKsefClient } from "./services/ksef-client.js";
import { initNatsService } from "./services/nats.service.js";
import { ksefRoutes } from "./routes/ksef.routes.js";
import { asNip } from "./types/ksef.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = "ksef-service" as const;
const START_TIME = Date.now();

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // ── 1. Database ─────────────────────────────────────────────────────────────
  const db = initDb();
  logger.info("PostgreSQL connection pool initialized");

  // ── 2. Domain services ──────────────────────────────────────────────────────
  const invoiceService = new InvoiceService(logger);
  const offlineService = new OfflineService(logger);
  const ksefClient = getKsefClient(env.KSEF_ENVIRONMENT, logger);
  const sellerNip = asNip(env.KSEF_NIP);

  // ── 3. NATS JetStream ───────────────────────────────────────────────────────
  const natsService = initNatsService(logger, invoiceService, sellerNip, ksefClient);
  await natsService.connect();

  // ── 4. Fastify ──────────────────────────────────────────────────────────────
  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdLogLabel: "reqId",
    genReqId: () => crypto.randomUUID(),
  });

  // ── 5. Security & middleware plugins ─────────────────────────────────────────
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

  // ── Auth middleware ──────────────────────────────────────────────────────────
  await app.register(createAuthPlugin({
    jwtPublicKey: process.env["JWT_PUBLIC_KEY"],
    jwtSecret: process.env["JWT_SECRET"],
    allowInternalHeaders: true,
    internalServiceSecret: process.env["INTERNAL_SERVICE_SECRET"] ?? "true",
  }) as unknown as Parameters<typeof app.register>[0]);

  // ── 5b. Request / response hooks ──────────────────────────────────────────────
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
    // Lightweight KSeF availability probe
    const ksefStatus = await ksefClient.checkKsefStatus();

    const dependencies: DependencyHealth[] = [
      {
        name: "postgresql",
        status: db !== null ? "up" : "down",
      },
      {
        name: `ksef-${env.KSEF_ENVIRONMENT}`,
        status: ksefStatus.available ? "up" : "down",
      },
    ];

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
    return {
      ready: true,
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
    };
  });

  // ── 7. KSeF routes ───────────────────────────────────────────────────────────
  await app.register(ksefRoutes, {
    invoiceService,
    offlineService,
    ksefClient,
    natsService,
    logger,
  });

  // ── 8. Graceful shutdown ─────────────────────────────────────────────────────
  onShutdown({
    description: "Fastify HTTP server",
    cleanup: async () => {
      await app.close();
    },
  });

  onShutdown({
    description: "NATS JetStream service",
    cleanup: async () => {
      await natsService.close();
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
    {
      port: env.PORT,
      host: env.HOST,
      service: SERVICE_NAME,
      ksefEnvironment: env.KSEF_ENVIRONMENT,
      sellerNip: env.KSEF_NIP,
    },
    "KSeF compliance engine started",
  );

  // ── 10. Log grace period status ──────────────────────────────────────────────
  const mandatoryDate = new Date("2026-04-01");
  const gracePeriodEndDate = new Date("2027-01-01");
  const now = new Date();

  if (now < mandatoryDate) {
    logger.info(
      { mandatoryFrom: "2026-04-01", gracePeriodUntil: "2027-01-01" },
      "KSeF mandatory e-invoicing not yet in effect — preparation mode",
    );
  } else if (now < gracePeriodEndDate) {
    logger.warn(
      { mandatoryFrom: "2026-04-01", gracePeriodUntil: "2027-01-01" },
      "KSeF mandatory — grace period active (no penalties until 2027-01-01)",
    );
  } else {
    logger.info(
      { mandatoryFrom: "2026-04-01" },
      "KSeF mandatory e-invoicing fully enforced — all penalties apply",
    );
  }
}

bootstrap().catch((err: unknown) => {
  logger.fatal({ err }, "Failed to start ksef-service");
  process.exit(1);
});
