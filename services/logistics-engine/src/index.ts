// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — logistics-engine
// Service entrypoint — Fastify 5.x + BullMQ + NATS + InPost
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

// Telemetry must be first — before any instrumented imports
const telemetry = initTelemetry({ serviceName: "logistics-engine" });
const logger = createLogger({ service: "logistics-engine" });

import Fastify from "fastify";
import type { CarrierCapabilities } from "./types/carrier.js";

const INPOST_CAPABILITIES_STUB: CarrierCapabilities = {
  hasWebhooks: false,
  hasPickupPoints: false,
  hasCOD: false,
  maxCODAmount: 0,
  maxWeightKg: 0,
  maxDimensionsCm: [0, 0, 0],
  hasReturnLabels: false,
  labelFormats: [],
  isSOAP: false,
  requiresMutex: false,
  isImplemented: false,
};
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";

import { env } from "./config/env.js";
import { createAuthPlugin } from "@ecompilot/shared-auth";
import {
  registerLogisticsRoutes,
  createLogisticsDeps,
} from "./routes/logistics.routes.js";
import {
  TrackingWorker,
  createTrackingQueue,
} from "./services/tracking.worker.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = "logistics-engine" as const;
const START_TIME = Date.now();

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // ── Fastify app ───────────────────────────────────────────────────────────
  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdLogLabel: "reqId",
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 5 * 1024 * 1024, // 5 MB — batch label uploads can be large
  });

  // ── Security & middleware ─────────────────────────────────────────────────
  await app.register(helmet as unknown as Parameters<typeof app.register>[0], {
    contentSecurityPolicy: false, // managed externally via API gateway
  });
  await app.register(cors as unknown as Parameters<typeof app.register>[0], {
    origin: env.NODE_ENV === "production" ? false : true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });
  await app.register(rateLimit as unknown as Parameters<typeof app.register>[0], {
    global: true,
    max: 200,
    timeWindow: "1 minute",
    ban: 5,
    keyGenerator: (req: import("fastify").FastifyRequest) => {
      const forwarded = req.headers["x-forwarded-for"];
      if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() ?? req.ip;
      return req.ip;
    },
  });

  // ── Auth middleware ──────────────────────────────────────────────────────
  await app.register(createAuthPlugin({
    jwtPublicKey: process.env["JWT_PUBLIC_KEY"],
    jwtSecret: process.env["JWT_SECRET"],
    allowInternalHeaders: true,
    internalServiceSecret: process.env["INTERNAL_SERVICE_SECRET"] ?? "true",
  }) as unknown as Parameters<typeof app.register>[0]);

  // ── Request / response logging hooks ────────────────────────────────────
  app.addHook("onRequest", async (request) => {
    logger.info(
      {
        reqId: request.id,
        method: request.method,
        url: request.url,
        userAgent: request.headers["user-agent"],
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

  // ── BullMQ tracking worker ─────────────────────────────────────────────────
  // Worker starts listening immediately; enqueuing happens via route handlers.
  // We pass a placeholder InPost connector — the full connector is wired inside
  // createLogisticsDeps and re-used by the worker after deps are constructed.

  // Build deps first so we can extract the InPost connector for the worker
  // We need a circular dep workaround: worker needs connector, deps needs worker.
  // Solution: create worker lazily after deps are ready.
  let trackingWorker!: TrackingWorker;

  // ── Logistics route deps (creates connectors, DB pool, NATS, S3) ──────────
  // Worker is created here with the real InPost connector from deps
  const { InPostConnector } = await import("./connectors/inpost.connector.js");

  // Pre-build InPost connector for the tracking worker
  let inpostConnector: InstanceType<typeof InPostConnector> | undefined;
  if (
    env.INPOST_API_TOKEN !== undefined &&
    env.INPOST_ORGANIZATION_ID !== undefined
  ) {
    inpostConnector = new InPostConnector(
      {
        apiToken: env.INPOST_API_TOKEN,
        organizationId: env.INPOST_ORGANIZATION_ID,
        baseUrl: env.INPOST_API_BASE_URL,
        cbFailureThreshold: env.CB_FAILURE_THRESHOLD,
        cbRecoveryTimeoutMs: env.CB_RECOVERY_TIMEOUT_MS,
      },
      logger,
    );
  }

  if (inpostConnector !== undefined) {
    trackingWorker = new TrackingWorker({
      redisUrl: env.REDIS_URL,
      databaseUrl: env.DATABASE_URL,
      natsUrl: env.NATS_URL,
      inpostConnector,
      logger,
      concurrency: env.TRACKING_POLL_CONCURRENCY,
    });
  } else {
    // Minimal no-op worker when InPost is not configured
    // Create queue only (no processor) to allow route to enqueue jobs safely
    logger.warn("InPost credentials not configured — tracking worker will not poll");
    // Still create a real TrackingWorker so routes compile, but it won't poll
    const notConfigured = (): never => { throw new Error("InPost not configured"); };
    const dummyConnector = {
      code: "inpost" as const,
      capabilities: INPOST_CAPABILITIES_STUB,
      createShipment: notConfigured,
      getShipment: notConfigured,
      cancelShipment: notConfigured,
      getLabel: notConfigured,
      getBatchLabels: notConfigured,
      getTracking: notConfigured,
      withResilience: notConfigured,
      httpRequest: notConfigured,
      normaliseError: notConfigured,
      assertSuccessStatus: notConfigured,
      getCircuitState: () => "OPEN" as const,
      logger,
    };

    trackingWorker = new TrackingWorker({
      redisUrl: env.REDIS_URL,
      databaseUrl: env.DATABASE_URL,
      natsUrl: env.NATS_URL,
      inpostConnector: dummyConnector as unknown as InstanceType<typeof InPostConnector>,
      logger,
      concurrency: 1,
    });
  }

  const deps = await createLogisticsDeps(logger, trackingWorker);

  // ── Register logistics routes ─────────────────────────────────────────────
  await registerLogisticsRoutes(app, deps);

  // ── Graceful shutdown handlers ─────────────────────────────────────────────
  onShutdown({
    description: "Fastify HTTP server",
    cleanup: async () => {
      await app.close();
    },
  });

  onShutdown({
    description: "BullMQ tracking worker",
    cleanup: async () => {
      await trackingWorker.close();
    },
  });

  onShutdown({
    description: "NATS connection",
    cleanup: async () => {
      await deps.nats.drain();
    },
  });

  onShutdown({
    description: "Redis client",
    cleanup: async () => {
      await deps.redis.quit();
    },
  });

  onShutdown({
    description: "OpenTelemetry SDK",
    cleanup: async () => {
      await telemetry.shutdown();
    },
  });

  registerGracefulShutdown(logger);

  // ── Start server ──────────────────────────────────────────────────────────
  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info(
    { port: env.PORT, host: env.HOST, service: SERVICE_NAME, env: env.NODE_ENV },
    "Logistics engine started",
  );
}

bootstrap().catch((err: unknown) => {
  logger.fatal({ err }, "Failed to start logistics-engine");
  process.exit(1);
});
