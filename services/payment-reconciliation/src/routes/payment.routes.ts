// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — payment-reconciliation
// Payment Routes
//
// Route prefix: /api/v1
//
// Transactions:
//   POST   /transactions                     — create new transaction
//   GET    /transactions                     — list transactions
//   GET    /transactions/:id                 — get transaction by ID
//   POST   /transactions/:id/verify          — verify payment
//   POST   /transactions/:id/refund          — issue refund
// BLIK:
//   POST   /blik                             — submit BLIK code
// Gateways:
//   GET    /gateways                         — list gateway capabilities
//   POST   /gateways/recommend               — recommend best gateway
// Credentials:
//   POST   /gateways/credentials             — store gateway credentials
//   PUT    /gateways/credentials/:id         — update credentials
//   DELETE /gateways/credentials/:id         — deactivate credentials
// Reconciliation:
//   GET    /reconciliation                   — list reconciliation reports
//   POST   /reconciliation/run               — trigger manual run
// Commissions:
//   GET    /commissions                      — calculate commission breakdown
// Webhooks:
//   POST   /webhooks/payments/:gateway       — gateway webhook endpoint
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { NatsConnection } from "nats";
import type { Logger } from "pino";
import { eq, and, desc, gte, lt, SQL } from "drizzle-orm";
import type { Queue } from "bullmq";
import type * as schema from "../db/schema.js";
import {
  transactions,
  refunds,
  reconciliationReports,
  gatewayCredentials,
} from "../db/schema.js";
import type { GatewayCode, SupportedCurrency } from "../types/payment.js";
import { recommendGateways } from "../services/gateway-recommender.js";
import { GATEWAY_CAPABILITIES } from "../services/gateway-recommender.js";
import type { ReconciliationJobData } from "../services/reconciliation.service.js";
import type { PaymentGatewayConnector } from "../types/payment.js";
import { requireAuth } from "@ecompilot/shared-auth";

// ─────────────────────────────────────────────────────────────────────────────
// Zod validation schemas for request bodies
// ─────────────────────────────────────────────────────────────────────────────

const GatewayCodeSchema = z.enum([
  "przelewy24",
  "payu",
  "tpay",
  "paynow",
  "imoje",
]);

const CurrencySchema = z.enum(["PLN", "EUR", "GBP", "USD", "CZK"]);

const CreateTransactionBodySchema = z.object({
  gatewayCode: GatewayCodeSchema,
  orderId: z.string().uuid().nullable().default(null),
  // sellerId is now derived from JWT -- no longer accepted in body
  organizationId: z.string().uuid().nullable().optional(),
  amountGrosze: z.number().int().positive(),
  currency: CurrencySchema.default("PLN"),
  description: z.string().min(1).max(255),
  customerEmail: z.string().email(),
  customerFirstName: z.string().min(1).max(100),
  customerLastName: z.string().min(1).max(100),
  customerPhone: z.string().max(20).nullable().optional(),
  returnUrl: z.string().url(),
  language: z.string().length(2).default("pl"),
  metadata: z.record(z.string()).optional(),
});

const VerifyTransactionBodySchema = z.object({
  amountGrosze: z.number().int().positive(),
  currency: CurrencySchema.default("PLN"),
});

const RefundTransactionBodySchema = z.object({
  amountGrosze: z.number().int().positive(),
  reason: z.string().min(1).max(255),
});

const BlikBodySchema = z.object({
  transactionId: z.string().uuid(),
  blikCode: z.string().regex(/^\d{6}$/, "BLIK code must be exactly 6 digits"),
  customerEmail: z.string().email(),
});

const RecommendGatewayBodySchema = z.object({
  amountGrosze: z.number().int().positive(),
  currency: CurrencySchema.default("PLN"),
  requiresBlik: z.boolean().optional(),
  requiresCards: z.boolean().optional(),
  requiresBNPL: z.boolean().optional(),
  requiresB2BBNPL: z.boolean().optional(),
  requiresMarketplaceSplit: z.boolean().optional(),
  minimiseCommission: z.boolean().optional(),
});

const StoreCredentialsBodySchema = z.object({
  // sellerId is now derived from JWT
  gatewayCode: GatewayCodeSchema,
  credentials: z.record(z.string()),
  isSandbox: z.boolean().default(false),
  commissionRateOverride: z.number().min(0).max(1).optional(),
});

const UpdateCredentialsBodySchema = z.object({
  credentials: z.record(z.string()).optional(),
  isActive: z.boolean().optional(),
  isSandbox: z.boolean().optional(),
  commissionRateOverride: z.number().min(0).max(1).optional(),
});

const RunReconciliationBodySchema = z.object({
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  sellerId: z.string().uuid().optional(),
});

const CommissionsQuerySchema = z.object({
  amountGrosze: z.string().regex(/^\d+$/).transform(Number),
  currency: CurrencySchema.default("PLN"),
});

const ListTransactionsQuerySchema = z.object({
  sellerId: z.string().uuid().optional(),
  status: z.enum([
    "pending",
    "waiting_for_payment",
    "processing",
    "completed",
    "failed",
    "cancelled",
    "refunded",
    "partially_refunded",
    "disputed",
    "chargeback",
  ]).optional(),
  gatewayCode: GatewayCodeSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).default("50"),
  offset: z.string().regex(/^\d+$/).transform(Number).default("0"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Route dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface PaymentRoutesDeps {
  db: NodePgDatabase<typeof schema>;
  nats: NatsConnection;
  logger: Logger;
  reconciliationQueue: Queue<ReconciliationJobData>;
  getConnector: (gatewayCode: GatewayCode) => PaymentGatewayConnector;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reply helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseBody<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown, reply: FastifyReply): T | null {
  const result = schema.safeParse(raw);
  if (!result.success) {
    void reply.status(422).send({
      error: "Validation failed",
      issues: result.error.errors,
    });
    return null;
  }
  return result.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────────────────────────────────────────

export async function registerPaymentRoutes(
  app: FastifyInstance,
  deps: PaymentRoutesDeps,
): Promise<void> {
  const { db, reconciliationQueue, getConnector, logger } = deps;

  // All routes require auth except webhooks and public gateway info
  app.addHook("preHandler", async (request, reply) => {
    const url = request.url.split("?")[0] ?? "";
    // Webhooks use gateway-specific signature verification, not JWT
    if (url.startsWith("/api/v1/webhooks/")) return;
    // Gateway capabilities are public reference data
    if (url === "/api/v1/gateways" && request.method === "GET") return;
    // Commission calculator is public reference data
    if (url === "/api/v1/commissions" && request.method === "GET") return;
    await requireAuth(request, reply);
  });

  // ── POST /transactions ────────────────────────────────────────────────────

  app.post("/transactions", { preHandler: [requireAuth] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(CreateTransactionBodySchema, request.body, reply);
    if (body === null) return;

    // SECURITY: sellerId is derived from verified JWT, not from request body
    const sellerId = request.authUser!.sub;

    const connector = getConnector(body.gatewayCode);

    const serviceBaseUrl = process.env["SERVICE_BASE_URL"] ?? "http://localhost:3008";
    const notifyUrl = `${serviceBaseUrl}/api/v1/webhooks/payments/${body.gatewayCode}`;

    let createResult;
    try {
      createResult = await connector.createTransaction({
        orderId: body.orderId,
        sellerId,
        amountGrosze: body.amountGrosze,
        currency: body.currency as SupportedCurrency,
        description: body.description,
        customerEmail: body.customerEmail,
        customerFirstName: body.customerFirstName,
        customerLastName: body.customerLastName,
        customerPhone: body.customerPhone ?? null,
        returnUrl: body.returnUrl,
        notifyUrl,
        language: body.language,
        ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
      });
    } catch (err) {
      logger.error({ err, gatewayCode: body.gatewayCode }, "Failed to create gateway transaction");
      return reply.status(502).send({
        error: "Gateway error",
        message: err instanceof Error ? err.message : "Failed to create transaction",
      });
    }

    const feeGrosze =
      Math.ceil(body.amountGrosze * connector.capabilities.commissionRate) +
      connector.capabilities.fixedFeeGrosze;

    const [inserted] = await db
      .insert(transactions)
      .values({
        gatewayCode: body.gatewayCode,
        gatewayTransactionId: createResult.gatewayTransactionId,
        orderId: body.orderId,
        sellerId,
        organizationId: body.organizationId ?? null,
        amountGrosze: body.amountGrosze,
        feeGrosze,
        netGrosze: body.amountGrosze - feeGrosze,
        currency: body.currency as SupportedCurrency,
        status: createResult.status,
        returnUrl: body.returnUrl,
        notifyUrl,
        description: body.description,
        language: body.language,
        ...(createResult.expiresAt !== null ? { expiresAt: new Date(createResult.expiresAt) } : {}),
      })
      .returning();

    if (inserted === undefined) {
      return reply.status(500).send({ error: "Failed to persist transaction" });
    }

    return reply.status(201).send({
      id: inserted.id,
      gatewayTransactionId: createResult.gatewayTransactionId,
      redirectUrl: createResult.redirectUrl,
      status: createResult.status,
      expiresAt: createResult.expiresAt,
    });
  });

  // ── GET /transactions ─────────────────────────────────────────────────────

  app.get("/transactions", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = parseBody(ListTransactionsQuerySchema, request.query, reply);
    if (query === null) return;

    const conditions: SQL[] = [];

    // SECURITY: Scope transactions to the authenticated user
    conditions.push(eq(transactions.sellerId, request.authUser!.sub));
    if (query.status !== undefined) {
      conditions.push(eq(transactions.status, query.status));
    }
    if (query.gatewayCode !== undefined) {
      conditions.push(eq(transactions.gatewayCode, query.gatewayCode));
    }
    if (query.from !== undefined) {
      conditions.push(gte(transactions.createdAt, new Date(query.from)));
    }
    if (query.to !== undefined) {
      conditions.push(lt(transactions.createdAt, new Date(query.to)));
    }

    const rows = await db
      .select()
      .from(transactions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(transactions.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    return reply.send({ transactions: rows, limit: query.limit, offset: query.offset });
  });

  // ── GET /transactions/:id ─────────────────────────────────────────────────

  app.get("/transactions/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const [row] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);

    if (row === undefined) {
      return reply.status(404).send({ error: "Transaction not found" });
    }

    return reply.send(row);
  });

  // ── POST /transactions/:id/verify ─────────────────────────────────────────

  app.post("/transactions/:id/verify", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = parseBody(VerifyTransactionBodySchema, request.body, reply);
    if (body === null) return;

    const [tx] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);

    if (tx === undefined) {
      return reply.status(404).send({ error: "Transaction not found" });
    }

    const connector = getConnector(tx.gatewayCode);

    let verifyResult;
    try {
      verifyResult = await connector.verifyTransaction({
        gatewayTransactionId: tx.gatewayTransactionId,
        orderId: tx.orderId ?? "",
        amountGrosze: body.amountGrosze,
        currency: body.currency as SupportedCurrency,
      });
    } catch (err) {
      logger.error({ err, transactionId: id }, "Failed to verify transaction");
      return reply.status(502).send({
        error: "Gateway error",
        message: err instanceof Error ? err.message : "Failed to verify transaction",
      });
    }

    const [updated] = await db
      .update(transactions)
      .set({
        status: verifyResult.status,
        ...(verifyResult.paymentMethod != null ? { paymentMethod: verifyResult.paymentMethod } : {}),
        ...(verifyResult.completedAt !== null ? { completedAt: new Date(verifyResult.completedAt) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, id))
      .returning();

    return reply.send({
      verified: verifyResult.verified,
      status: verifyResult.status,
      gatewayStatus: verifyResult.gatewayStatus,
      paidAmountGrosze: verifyResult.paidAmountGrosze,
      paymentMethod: verifyResult.paymentMethod,
      completedAt: verifyResult.completedAt,
      transaction: updated,
    });
  });

  // ── POST /transactions/:id/refund ─────────────────────────────────────────

  app.post("/transactions/:id/refund", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = parseBody(RefundTransactionBodySchema, request.body, reply);
    if (body === null) return;

    const [tx] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);

    if (tx === undefined) {
      return reply.status(404).send({ error: "Transaction not found" });
    }

    if (tx.status !== "completed" && tx.status !== "partially_refunded") {
      return reply.status(409).send({
        error: "Cannot refund",
        message: `Transaction status is ${tx.status}, only completed or partially_refunded transactions can be refunded`,
      });
    }

    if (body.amountGrosze > tx.amountGrosze) {
      return reply.status(422).send({
        error: "Refund amount exceeds transaction amount",
      });
    }

    const connector = getConnector(tx.gatewayCode);

    let refundResult;
    try {
      refundResult = await connector.refundTransaction({
        gatewayTransactionId: tx.gatewayTransactionId,
        amountGrosze: body.amountGrosze,
        currency: tx.currency as SupportedCurrency,
        reason: body.reason,
      });
    } catch (err) {
      logger.error({ err, transactionId: id }, "Failed to process refund");
      return reply.status(502).send({
        error: "Gateway error",
        message: err instanceof Error ? err.message : "Failed to process refund",
      });
    }

    const isFullRefund = body.amountGrosze === tx.amountGrosze;

    const [newRefund] = await db
      .insert(refunds)
      .values({
        transactionId: tx.id,
        gatewayCode: tx.gatewayCode,
        gatewayRefundId: refundResult.gatewayRefundId,
        amountGrosze: body.amountGrosze,
        currency: tx.currency as SupportedCurrency,
        status: refundResult.status,
        reason: body.reason,
      })
      .returning();

    await db
      .update(transactions)
      .set({
        status: isFullRefund ? "refunded" : "partially_refunded",
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, id));

    return reply.status(201).send(newRefund);
  });

  // ── POST /blik ─────────────────────────────────────────────────────────────

  app.post("/blik", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(BlikBodySchema, request.body, reply);
    if (body === null) return;

    const [tx] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, body.transactionId))
      .limit(1);

    if (tx === undefined) {
      return reply.status(404).send({ error: "Transaction not found" });
    }

    const connector = getConnector(tx.gatewayCode);

    if (connector.processBlik === undefined) {
      return reply.status(422).send({
        error: `Gateway ${tx.gatewayCode} does not support BLIK`,
      });
    }

    let blikResult;
    try {
      blikResult = await connector.processBlik({
        gatewayTransactionId: tx.gatewayTransactionId,
        blikCode: body.blikCode,
        customerEmail: body.customerEmail,
      });
    } catch (err) {
      logger.error({ err, transactionId: tx.id }, "Failed to process BLIK payment");
      return reply.status(502).send({
        error: "Gateway error",
        message: err instanceof Error ? err.message : "BLIK processing failed",
      });
    }

    await db
      .update(transactions)
      .set({
        status: blikResult.status,
        paymentMethod: "blik",
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, tx.id));

    return reply.send(blikResult);
  });

  // ── GET /gateways ──────────────────────────────────────────────────────────

  app.get("/gateways", async (_request: FastifyRequest, reply: FastifyReply) => {
    const gateways = Object.values(GATEWAY_CAPABILITIES);
    return reply.send({ gateways });
  });

  // ── POST /gateways/recommend ───────────────────────────────────────────────

  app.post("/gateways/recommend", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(RecommendGatewayBodySchema, request.body, reply);
    if (body === null) return;

    const recommendations = recommendGateways({
      amountGrosze: body.amountGrosze,
      currency: body.currency as SupportedCurrency,
      ...(body.requiresBlik !== undefined ? { requiresBlik: body.requiresBlik } : {}),
      ...(body.requiresCards !== undefined ? { requiresCards: body.requiresCards } : {}),
      ...(body.requiresBNPL !== undefined ? { requiresBNPL: body.requiresBNPL } : {}),
      ...(body.requiresB2BBNPL !== undefined ? { requiresB2BBNPL: body.requiresB2BBNPL } : {}),
      ...(body.requiresMarketplaceSplit !== undefined ? { requiresMarketplaceSplit: body.requiresMarketplaceSplit } : {}),
      ...(body.minimiseCommission !== undefined ? { minimiseCommission: body.minimiseCommission } : {}),
    });

    if (recommendations.length === 0) {
      return reply.status(422).send({
        error: "No eligible gateway",
        message: "No gateway supports the requested combination of features and currency",
      });
    }

    return reply.send({ recommendations });
  });

  // ── POST /gateways/credentials ─────────────────────────────────────────────

  app.post("/gateways/credentials", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(StoreCredentialsBodySchema, request.body, reply);
    if (body === null) return;

    // In production, credentials would be encrypted with AES-256-GCM before storage.
    // For now we store the JSON string — encryption wrapper should be added here.
    const encryptedCredentials = JSON.stringify(body.credentials);

    // SECURITY: sellerId derived from verified JWT, not from request body
    const sellerId = request.authUser!.sub;

    const [inserted] = await db
      .insert(gatewayCredentials)
      .values({
        sellerId,
        gatewayCode: body.gatewayCode,
        encryptedCredentials,
        isSandbox: body.isSandbox,
        commissionRateOverride: body.commissionRateOverride?.toString() ?? null,
      })
      .onConflictDoUpdate({
        target: [gatewayCredentials.sellerId, gatewayCredentials.gatewayCode],
        set: {
          encryptedCredentials,
          isSandbox: body.isSandbox,
          commissionRateOverride: body.commissionRateOverride?.toString() ?? null,
          isActive: true,
          deletedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: gatewayCredentials.id });

    if (inserted === undefined) {
      return reply.status(500).send({ error: "Failed to store credentials" });
    }

    return reply.status(201).send({ id: inserted.id });
  });

  // ── PUT /gateways/credentials/:id ─────────────────────────────────────────

  app.put("/gateways/credentials/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = parseBody(UpdateCredentialsBodySchema, request.body, reply);
    if (body === null) return;

    const updates: Partial<typeof gatewayCredentials.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.credentials !== undefined) {
      updates.encryptedCredentials = JSON.stringify(body.credentials);
    }
    if (body.isActive !== undefined) {
      updates.isActive = body.isActive;
    }
    if (body.isSandbox !== undefined) {
      updates.isSandbox = body.isSandbox;
    }
    if (body.commissionRateOverride !== undefined) {
      updates.commissionRateOverride = body.commissionRateOverride.toString();
    }

    const [updated] = await db
      .update(gatewayCredentials)
      .set(updates)
      .where(and(eq(gatewayCredentials.id, id), eq(gatewayCredentials.isActive, true)))
      .returning({ id: gatewayCredentials.id });

    if (updated === undefined) {
      return reply.status(404).send({ error: "Gateway credentials not found" });
    }

    return reply.send({ id: updated.id });
  });

  // ── DELETE /gateways/credentials/:id ──────────────────────────────────────

  app.delete("/gateways/credentials/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const [updated] = await db
      .update(gatewayCredentials)
      .set({
        isActive: false,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(gatewayCredentials.id, id))
      .returning({ id: gatewayCredentials.id });

    if (updated === undefined) {
      return reply.status(404).send({ error: "Gateway credentials not found" });
    }

    return reply.status(204).send();
  });

  // ── GET /reconciliation ───────────────────────────────────────────────────

  app.get("/reconciliation", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { sellerId?: string; limit?: string; offset?: string };
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const offset = Number(query.offset ?? 0);

    const conditions: SQL[] = [];
    if (query.sellerId !== undefined) {
      conditions.push(eq(reconciliationReports.sellerId, query.sellerId));
    }

    const rows = await db
      .select()
      .from(reconciliationReports)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(reconciliationReports.generatedAt))
      .limit(limit)
      .offset(offset);

    return reply.send({ reports: rows, limit, offset });
  });

  // ── POST /reconciliation/run ──────────────────────────────────────────────

  app.post("/reconciliation/run", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(RunReconciliationBodySchema, request.body, reply);
    if (body === null) return;

    const jobId = `reconciliation:${body.targetDate}:${body.sellerId ?? "all"}`;

    await reconciliationQueue.add(
      "reconcile",
      {
        targetDate: body.targetDate,
        ...(body.sellerId !== undefined ? { sellerId: body.sellerId } : {}),
      },
      {
        jobId,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    );

    return reply.status(202).send({
      message: "Reconciliation job queued",
      jobId,
      targetDate: body.targetDate,
    });
  });

  // ── GET /commissions ──────────────────────────────────────────────────────

  app.get("/commissions", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = parseBody(CommissionsQuerySchema, request.query, reply);
    if (query === null) return;

    const breakdowns = (Object.values(GATEWAY_CAPABILITIES) as typeof GATEWAY_CAPABILITIES[keyof typeof GATEWAY_CAPABILITIES][]).map(
      (cap) => {
        const commissionGrosze = Math.ceil(query.amountGrosze * cap.commissionRate);
        const totalFeeGrosze = commissionGrosze + cap.fixedFeeGrosze;
        const netGrosze = query.amountGrosze - totalFeeGrosze;
        return {
          gatewayCode: cap.code,
          displayName: cap.displayName,
          amountGrosze: query.amountGrosze,
          commissionGrosze,
          fixedFeeGrosze: cap.fixedFeeGrosze,
          totalFeeGrosze,
          netGrosze,
          effectiveRatePercent:
            Math.round((totalFeeGrosze / query.amountGrosze) * 100 * 10000) / 10000,
        };
      },
    );

    // Sort by total fee ascending
    breakdowns.sort((a, b) => a.totalFeeGrosze - b.totalFeeGrosze);

    return reply.send({
      amountGrosze: query.amountGrosze,
      currency: query.currency,
      breakdowns,
    });
  });

  // ── POST /webhooks/payments/:gateway ──────────────────────────────────────
  //
  // Receives webhook notifications from payment gateways.
  // Verifies authenticity with HMAC/checksum, then processes the event.
  // Returns 200 quickly — heavy processing is async.

  app.post("/webhooks/payments/:gateway", {
    config: { rawBody: true },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { gateway } = request.params as { gateway: string };

    const gatewayCodeResult = GatewayCodeSchema.safeParse(gateway);
    if (!gatewayCodeResult.success) {
      return reply.status(404).send({ error: `Unknown gateway: ${gateway}` });
    }

    const gatewayCode = gatewayCodeResult.data;
    const connector = getConnector(gatewayCode);

    // rawBody must be available — requires @fastify/raw-body or similar plugin
    const rawBody =
      (request as FastifyRequest & { rawBody?: Buffer }).rawBody ??
      Buffer.from(JSON.stringify(request.body));

    const headers = Object.fromEntries(
      Object.entries(request.headers).map(([k, v]) => [k, v]),
    );

    // Verify signature — reject immediately if invalid
    let isValid: boolean;
    try {
      isValid = await connector.verifyWebhook({ rawBody, headers });
    } catch (err) {
      logger.warn({ err, gateway: gatewayCode }, "Webhook verification threw");
      return reply.status(400).send({ error: "Webhook verification failed" });
    }

    if (!isValid) {
      logger.warn({ gateway: gatewayCode }, "Webhook signature invalid");
      return reply.status(401).send({ error: "Invalid webhook signature" });
    }

    // Parse
    let parsed;
    try {
      parsed = await connector.parseWebhook(rawBody, headers);
    } catch (err) {
      logger.error({ err, gateway: gatewayCode }, "Failed to parse webhook");
      return reply.status(400).send({ error: "Failed to parse webhook payload" });
    }

    // Async processing — find and update transaction
    void (async () => {
      try {
        const [tx] = await db
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.gatewayCode, gatewayCode),
              eq(transactions.gatewayTransactionId, parsed.gatewayTransactionId),
            ),
          )
          .limit(1);

        if (tx === undefined) {
          logger.warn(
            {
              gateway: gatewayCode,
              gatewayTransactionId: parsed.gatewayTransactionId,
            },
            "Webhook received for unknown transaction",
          );
          return;
        }

        await db
          .update(transactions)
          .set({
            status: parsed.status,
            ...(parsed.paymentMethod != null ? { paymentMethod: parsed.paymentMethod } : {}),
            ...(parsed.status === "completed" ? { completedAt: new Date() } : {}),
            gatewayMetadata: parsed.rawPayload,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, tx.id));

        logger.info(
          {
            transactionId: tx.id,
            gateway: gatewayCode,
            status: parsed.status,
          },
          "Transaction updated from webhook",
        );
      } catch (err) {
        logger.error({ err, gateway: gatewayCode }, "Failed to process webhook async");
      }
    })();

    // Acknowledge immediately (gateways retry if they don't get 200 fast)
    return reply.status(200).send({ received: true });
  });
}
