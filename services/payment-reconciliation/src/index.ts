// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — payment-reconciliation
// Service entrypoint
//
// Boot order:
//   1. Parse env (fails fast on bad config)
//   2. Init OpenTelemetry (must be first)
//   3. Connect PostgreSQL (Drizzle + node-postgres)
//   4. Connect NATS JetStream
//   5. Connect Redis + BullMQ
//   6. Register gateway connectors
//   7. Start Fastify HTTP server
//   8. Subscribe to NATS marketplace.order.created
//   9. Register graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────

import { env } from "./config/env.js";
import {
  initTelemetry,
  createLogger,
  registerGracefulShutdown,
  onShutdown,
} from "@ecompilot/shared-observability";
import type { HealthCheckResponse, ReadinessCheckResponse } from "@ecompilot/shared-types";

// OpenTelemetry MUST be initialised before any other instrumented import
const telemetry = initTelemetry({ serviceName: "payment-reconciliation" });
const logger = createLogger({ service: "payment-reconciliation" });

import Fastify, { type FastifyPluginAsync } from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { connect as natsConnect } from "nats";
import type { NatsConnection, JetStreamClient } from "nats";

import { Queue, Worker } from "bullmq";
import { Redis, type Redis as IORedis } from "ioredis";

import * as schema from "./db/schema.js";
import { transactions } from "./db/schema.js";
import { eq, and } from "drizzle-orm";

import type { GatewayCode } from "./types/payment.js";
import type { PaymentGatewayConnector } from "./types/payment.js";

import { createPrzelewy24Connector } from "./connectors/przelewy24.connector.js";
import { createPaynowConnector } from "./connectors/paynow.connector.js";
import { createPayuConnector } from "./connectors/payu.connector.js";
import { createTpayConnector } from "./connectors/tpay.connector.js";
import { createImojeConnector } from "./connectors/imoje.connector.js";

import { createAuthPlugin } from "@ecompilot/shared-auth";
import { registerPaymentRoutes } from "./routes/payment.routes.js";
import { runReconciliation } from "./services/reconciliation.service.js";
import type { ReconciliationJobData } from "./services/reconciliation.service.js";

import {
  MarketplaceOrderCreatedEventSchema,
  SUBJECTS,
} from "@ecompilot/event-contracts";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_NAME = "payment-reconciliation" as const;
const START_TIME = Date.now();
const BULLMQ_QUEUE_NAME = "reconciliation";
const RECONCILIATION_CRON = "0 3 * * *"; // 03:00 UTC daily

// ─────────────────────────────────────────────────────────────────────────────
// Gateway connector registry
// ─────────────────────────────────────────────────────────────────────────────

function buildConnectorRegistry(): Map<GatewayCode, PaymentGatewayConnector> {
  const registry = new Map<GatewayCode, PaymentGatewayConnector>();

  if (
    env.P24_MERCHANT_ID !== undefined &&
    env.P24_CRC_KEY !== undefined &&
    env.P24_REPORT_KEY !== undefined
  ) {
    registry.set(
      "przelewy24",
      createPrzelewy24Connector({
        merchantId: Number(env.P24_MERCHANT_ID),
        posId: Number(env.P24_POS_ID ?? env.P24_MERCHANT_ID),
        crcKey: env.P24_CRC_KEY,
        reportKey: env.P24_REPORT_KEY,
        sandbox: env.P24_SANDBOX,
      }),
    );
    logger.info("Przelewy24 connector registered");
  } else {
    logger.warn("Przelewy24 credentials not configured — connector unavailable");
  }

  if (env.PAYNOW_API_KEY !== undefined && env.PAYNOW_SIGNATURE_KEY !== undefined) {
    registry.set(
      "paynow",
      createPaynowConnector({
        apiKey: env.PAYNOW_API_KEY,
        signatureKey: env.PAYNOW_SIGNATURE_KEY,
        sandbox: env.PAYNOW_SANDBOX,
      }),
    );
    logger.info("Paynow connector registered");
  } else {
    logger.warn("Paynow credentials not configured — connector unavailable");
  }

  if (env.PAYU_CLIENT_ID !== undefined && env.PAYU_CLIENT_SECRET !== undefined) {
    registry.set(
      "payu",
      createPayuConnector({
        clientId: env.PAYU_CLIENT_ID,
        clientSecret: env.PAYU_CLIENT_SECRET,
        posId: env.PAYU_POS_ID ?? "",
        secondKey: "",
        sandbox: env.PAYU_SANDBOX,
      }),
    );
    logger.info("PayU connector registered (stub)");
  }

  if (env.TPAY_CLIENT_ID !== undefined && env.TPAY_CLIENT_SECRET !== undefined) {
    registry.set(
      "tpay",
      createTpayConnector({
        clientId: env.TPAY_CLIENT_ID,
        clientSecret: env.TPAY_CLIENT_SECRET,
        merchantEmail: env.TPAY_MERCHANT_EMAIL ?? "",
        sandbox: env.TPAY_SANDBOX,
      }),
    );
    logger.info("Tpay connector registered (stub)");
  }

  if (env.IMOJE_SERVICE_ID !== undefined && env.IMOJE_SERVICE_KEY !== undefined) {
    registry.set(
      "imoje",
      createImojeConnector({
        serviceId: env.IMOJE_SERVICE_ID,
        serviceKey: env.IMOJE_SERVICE_KEY,
        merchantId: env.IMOJE_MERCHANT_ID ?? "",
        sandbox: env.IMOJE_SANDBOX,
      }),
    );
    logger.info("imoje connector registered (stub)");
  }

  return registry;
}

function getConnector(
  registry: Map<GatewayCode, PaymentGatewayConnector>,
): (code: GatewayCode) => PaymentGatewayConnector {
  return (code: GatewayCode) => {
    const connector = registry.get(code);
    if (connector === undefined) {
      throw new Error(`Gateway ${code} is not configured on this instance`);
    }
    return connector;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NATS — marketplace.order.created subscription
// ─────────────────────────────────────────────────────────────────────────────

async function subscribeMarketplaceOrders(
  nats: NatsConnection,
  js: JetStreamClient,
  db: NodePgDatabase<typeof schema>,
): Promise<void> {
  const sc = nats.info;
  void sc; // keep TS happy — used only for type narrowing

  const decoder = new TextDecoder();

  // Use JetStream push consumer with durable name for at-least-once delivery
  try {
    const consumer = await js.consumers.get(
      "ECOMPILOT_EVENTS",
      "payment-reconciliation-orders",
    );

    const messages = await consumer.consume();

    void (async () => {
      for await (const msg of messages) {
        try {
          const raw = JSON.parse(decoder.decode(msg.data)) as unknown;
          const result = MarketplaceOrderCreatedEventSchema.safeParse(raw);

          if (!result.success) {
            logger.warn({ subject: msg.subject }, "Ignoring non-order-created event");
            msg.ack();
            continue;
          }

          const event = result.data;
          const { orderId, totalAmount } = event.payload;

          // Check if we already have a transaction for this order
          const [existing] = await db
            .select({ id: transactions.id })
            .from(transactions)
            .where(
              and(
                eq(transactions.orderId, orderId),
              ),
            )
            .limit(1);

          if (existing !== undefined) {
            logger.debug({ orderId }, "Transaction already exists for order, skipping");
            msg.ack();
            continue;
          }

          logger.info(
            {
              orderId,
              amount: totalAmount.amount,
              currency: totalAmount.currency,
              marketplace: event.payload.marketplace,
            },
            "Marketplace order received — awaiting payment initiation by seller",
          );

          // The actual payment creation is initiated by the seller via the
          // POST /transactions endpoint. Here we just log receipt.
          msg.ack();
        } catch (err) {
          logger.error({ err }, "Error processing marketplace.order.created event");
          msg.nak();
        }
      }
    })();

    logger.info(
      { subject: SUBJECTS.MARKETPLACE_ORDER_CREATED },
      "Subscribed to marketplace order events",
    );
  } catch (err) {
    logger.warn(
      { err },
      "Could not subscribe to JetStream consumer — falling back to core NATS subject",
    );

    // Fallback: core NATS subscribe (no persistence)
    const sub = nats.subscribe(SUBJECTS.MARKETPLACE_ORDER_CREATED);
    void (async () => {
      for await (const msg of sub) {
        try {
          const raw = JSON.parse(decoder.decode(msg.data)) as unknown;
          const result = MarketplaceOrderCreatedEventSchema.safeParse(raw);
          if (result.success) {
            logger.info(
              { orderId: result.data.payload.orderId },
              "Marketplace order received (core NATS)",
            );
          }
        } catch (err) {
          logger.error({ err }, "Error in core NATS order subscription");
        }
      }
    })();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BullMQ — reconciliation worker
// ─────────────────────────────────────────────────────────────────────────────

function createReconciliationWorker(
  redis: IORedis,
  db: NodePgDatabase<typeof schema>,
  nats: NatsConnection,
): Worker<ReconciliationJobData> {
  const worker = new Worker<ReconciliationJobData>(
    BULLMQ_QUEUE_NAME,
    async (job) => {
      logger.info({ jobId: job.id, data: job.data }, "Running reconciliation job");

      const targetDate = job.data.targetDate || (() => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
      })();

      const report = await runReconciliation(
        {
          targetDate,
          ...(job.data.sellerId !== undefined ? { sellerId: job.data.sellerId } : {}),
        },
        { db, nats, logger },
      );

      logger.info(
        {
          reportId: report.id,
          matched: report.matchedCount,
          discrepancies: report.discrepancyCount,
        },
        "Reconciliation job completed",
      );

      return report;
    },
    {
      connection: redis,
      concurrency: 1, // reconciliation is IO-heavy, one at a time
      lockDuration: 5 * 60 * 1000, // 5 min max per job
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Reconciliation job failed");
  });

  return worker;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // ── 1. PostgreSQL ──────────────────────────────────────────────────────────
  const pgPool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  const db = drizzle(pgPool, { schema });
  logger.info("PostgreSQL connected");

  // ── 2. NATS ────────────────────────────────────────────────────────────────
  const nats = await natsConnect({ servers: env.NATS_URL });
  const js = nats.jetstream();
  logger.info("NATS connected");

  // ── 3. Redis + BullMQ ──────────────────────────────────────────────────────
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
  });

  const reconciliationQueue = new Queue<ReconciliationJobData>(BULLMQ_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    },
  });

  // Schedule daily cron at 03:00 UTC
  await reconciliationQueue.upsertJobScheduler(
    "daily-reconciliation",
    { pattern: RECONCILIATION_CRON, tz: "UTC" },
    {
      name: "reconcile",
      data: {
        targetDate: "", // worker computes previous day at runtime
      },
    },
  );

  const reconciliationWorker = createReconciliationWorker(redis, db, nats);
  logger.info("BullMQ reconciliation worker started");

  // ── 4. Gateway connectors ──────────────────────────────────────────────────
  const connectorRegistry = buildConnectorRegistry();

  // ── 5. Fastify ─────────────────────────────────────────────────────────────
  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdLogLabel: "reqId",
    genReqId: () => crypto.randomUUID(),
  });

  // Cast plugins to work around Fastify v4 plugin declarations being incompatible
  // with the Fastify v5 TypeProvider generic variance.
  type RegisterFn = (plugin: unknown, opts: unknown) => Promise<void>;
  await (app.register as unknown as RegisterFn)(helmet, { global: true });
  await (app.register as unknown as RegisterFn)(cors, { origin: false });
  await (app.register as unknown as RegisterFn)(rateLimit, { max: 200, timeWindow: "1 minute" });

  // ── Auth middleware ───────────────────────────────────────────────────────
  await app.register(createAuthPlugin({
    jwtPublicKey: process.env["JWT_PUBLIC_KEY"],
    jwtSecret: process.env["JWT_SECRET"],
    allowInternalHeaders: true,
    internalServiceSecret: process.env["INTERNAL_SERVICE_SECRET"] ?? "true",
  }) as unknown as Parameters<typeof app.register>[0]);

  // ── Request/response logging ───────────────────────────────────────────────
  app.addHook("onRequest", async (request) => {
    logger.info({
      reqId: request.id,
      method: request.method,
      url: request.url,
    }, "Incoming request");
  });

  app.addHook("onResponse", async (request, reply) => {
    logger.info({
      reqId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTimeMs: reply.elapsedTime,
    }, "Request completed");
  });

  // ── Health endpoints ───────────────────────────────────────────────────────
  app.get("/health", async (): Promise<HealthCheckResponse> => ({
    status: "healthy",
    service: SERVICE_NAME,
    version: process.env["npm_package_version"] ?? "0.1.0",
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    dependencies: [
      { name: "postgres", status: "up" as const },
      { name: "redis", status: redis.status === "ready" ? ("up" as const) : ("down" as const) },
      { name: "nats", status: nats.isClosed() ? ("down" as const) : ("up" as const) },
    ],
  }));

  app.get("/ready", async (): Promise<ReadinessCheckResponse> => ({
    ready: !nats.isClosed() && redis.status === "ready",
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
  }));

  // ── Payment routes under /api/v1 ───────────────────────────────────────────
  await app.register(async (prefixed) => {
    await registerPaymentRoutes(prefixed, {
      db,
      nats,
      logger,
      reconciliationQueue,
      getConnector: getConnector(connectorRegistry),
    });
  }, { prefix: "/api/v1" });

  // ── 6. NATS subscription ───────────────────────────────────────────────────
  await subscribeMarketplaceOrders(nats, js, db);

  // ── 7. Graceful shutdown ───────────────────────────────────────────────────
  onShutdown({
    description: "Fastify HTTP server",
    cleanup: async () => {
      await app.close();
    },
  });

  onShutdown({
    description: "BullMQ reconciliation worker",
    cleanup: async () => {
      await reconciliationWorker.close();
    },
  });

  onShutdown({
    description: "BullMQ queue",
    cleanup: async () => {
      await reconciliationQueue.close();
    },
  });

  onShutdown({
    description: "Redis",
    cleanup: async () => {
      await redis.quit();
    },
  });

  onShutdown({
    description: "NATS",
    cleanup: async () => {
      await nats.drain();
    },
  });

  onShutdown({
    description: "PostgreSQL",
    cleanup: async () => {
      await pgPool.end();
    },
  });

  onShutdown({
    description: "OpenTelemetry SDK",
    cleanup: async () => {
      await telemetry.shutdown();
    },
  });

  registerGracefulShutdown(logger);

  // ── 8. Listen ──────────────────────────────────────────────────────────────
  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info(
    { port: env.PORT, host: env.HOST, service: SERVICE_NAME },
    "Service started",
  );
}

bootstrap().catch((err: unknown) => {
  logger.fatal({ err }, "Failed to start payment-reconciliation service");
  process.exit(1);
});
