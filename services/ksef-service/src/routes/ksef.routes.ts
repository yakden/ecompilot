// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — ksef-service: KSeF REST routes
// Full CRUD and action endpoints for invoices, sessions, credentials, JPK & GTU
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import type { Logger } from "pino";
import { getDb } from "../db/client.js";
import { invoices, ksefSessions, ksefCredentials } from "../db/schema.js";
import {
  InvoiceService,
  type OrderInvoiceRequest,
} from "../services/invoice.service.js";
import { OfflineService } from "../services/offline.service.js";
import type { KsefClient } from "../services/ksef-client.js";
import type { NatsService } from "../services/nats.service.js";
import {
  asNip,
  asInvoiceNumber,
  asGrosze,
  GTU_DESCRIPTIONS,
} from "../types/ksef.js";
import { env } from "../config/env.js";

// ─────────────────────────────────────────────────────────────────────────────
// JWT user -- set by shared-auth middleware on request.authUser
// ─────────────────────────────────────────────────────────────────────────────

import { requireAuth } from "@ecompilot/shared-auth";

interface AuthRequest extends FastifyRequest {
  readonly authUser: NonNullable<FastifyRequest["authUser"]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error response helper
// ─────────────────────────────────────────────────────────────────────────────

function errorReply(
  reply: FastifyReply,
  code: number,
  errorCode: string,
  message: string,
  details?: unknown,
) {
  return reply.code(code).send({
    success: false,
    error: {
      code: errorCode,
      message,
      ...(details !== undefined ? { details } : {}),
      timestamp: new Date().toISOString(),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas for request validation
// ─────────────────────────────────────────────────────────────────────────────

const NipSchema = z.string().regex(/^\d{10}$/, "NIP must be exactly 10 digits");

const CreateInvoiceBodySchema = z.object({
  invoiceType: z.enum(["VAT", "KOR", "ZAL", "ROZ", "UPR"]).default("VAT"),
  buyerNip: NipSchema.optional(),
  buyerNipUe: z.string().optional(),
  buyerCountryCode: z.string().length(2).default("PL"),
  buyerName: z.string().min(1).max(256),
  buyerCity: z.string().min(1),
  buyerPostalCode: z.string().optional(),
  buyerStreet: z.string().optional(),
  orderType: z.enum(["B2B", "B2C", "OSS", "IOSS"]).default("B2C"),
  items: z.array(z.object({
    name: z.string().min(1).max(256),
    quantity: z.number().int().positive(),
    unitPriceGrosze: z.number().int().positive(),
    vatRate: z.union([z.literal(23), z.literal(8), z.literal(5), z.literal(0)]).default(23),
    sku: z.string().optional(),
  })).min(1),
  paymentMethod: z.enum(["przelew", "gotowka", "karta", "blik", "inna"]).default("przelew"),
  paymentDueDate: z.string().date().optional(),
  bankAccountIban: z.string().optional(),
  invoiceNumber: z.string().optional(),
  issueDate: z.string().date().optional(),
  notatkiDodatkowe: z.string().max(500).optional(),
});

type CreateInvoiceBody = z.infer<typeof CreateInvoiceBodySchema>;

const ListInvoicesQuerySchema = z.object({
  page: z.string().default("1").transform(Number),
  limit: z.string().default("20").transform(Number),
  status: z.enum(["draft", "pending_ksef", "submitted", "accepted", "rejected", "offline"]).optional(),
  invoiceType: z.enum(["VAT", "KOR", "ZAL", "ROZ", "UPR"]).optional(),
});

const BatchSubmitBodySchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1).max(100),
});

const CredentialsBodySchema = z.object({
  environment: z.enum(["test", "demo", "production"]),
  authMethod: z.enum(["token", "xades"]).default("token"),
  nipNumber: NipSchema,
  /** Plaintext token — will be encrypted at rest using AES-256-GCM */
  token: z.string().min(1),
});

const JpkGenerateBodySchema = z.object({
  periodFrom: z.string().date(),
  periodTo: z.string().date(),
  jpkType: z.enum(["JPK_V7M", "JPK_V7K"]).default("JPK_V7M"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Plugin context
// ─────────────────────────────────────────────────────────────────────────────

export interface KsefRouteContext {
  readonly invoiceService: InvoiceService;
  readonly offlineService: OfflineService;
  readonly ksefClient: KsefClient;
  readonly natsService: NatsService;
  readonly logger: Logger;
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple AES-256-GCM token encryption for credentials storage
// In production, consider using a KMS (e.g. AWS KMS, HashiCorp Vault)
// ─────────────────────────────────────────────────────────────────────────────

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const CREDENTIALS_ENCRYPTION_KEY_HEX = process.env["CREDENTIALS_ENCRYPTION_KEY"];
if (!CREDENTIALS_ENCRYPTION_KEY_HEX) {
  throw new Error(
    "FATAL: CREDENTIALS_ENCRYPTION_KEY must be set. Cannot start without encryption key for credential storage.",
  );
}

const ENCRYPTION_KEY = Buffer.from(CREDENTIALS_ENCRYPTION_KEY_HEX, "hex").slice(0, 32);

function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptToken(encryptedData: string): string {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted token format");
  const [ivB64, tagB64, dataB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf-8");
}

// ─────────────────────────────────────────────────────────────────────────────
// Route plugin
// ─────────────────────────────────────────────────────────────────────────────

export async function ksefRoutes(
  fastify: FastifyInstance,
  opts: KsefRouteContext,
): Promise<void> {
  const { invoiceService, offlineService, ksefClient, natsService, logger } = opts;

  // All routes require auth except GTU codes and status (public reference data)
  fastify.addHook("preHandler", async (request, reply) => {
    const publicPaths = ["/api/v1/ksef/gtu-codes", "/api/v1/ksef/status"];
    if (publicPaths.includes(request.url.split("?")[0] ?? "")) return;
    await requireAuth(request, reply);
  });

  // ── POST /api/v1/ksef/invoices -- create a new invoice ─────────────────────

  fastify.post(
    "/api/v1/ksef/invoices",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthRequest;
      const userId = req.authUser!.sub;

      const parseResult = CreateInvoiceBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return errorReply(reply, 400, "VALIDATION_ERROR", "Invalid request body", parseResult.error.flatten());
      }

      const body = parseResult.data;
      const now = new Date();
      const issueDate = body.issueDate ?? now.toISOString().slice(0, 10);
      const invoiceNumber = body.invoiceNumber !== undefined
        ? asInvoiceNumber(body.invoiceNumber)
        : InvoiceService.buildInvoiceNumber(now.getFullYear(), now.getMonth() + 1, Date.now() % 9999);

      const orderReq: OrderInvoiceRequest = {
        orderId: crypto.randomUUID(),
        userId,
        orderType: body.orderType,
        buyerNip: body.buyerNip !== undefined ? asNip(body.buyerNip) : undefined,
        buyerNipUe: body.buyerNipUe,
        buyerCountryCode: body.buyerCountryCode,
        buyerName: body.buyerName,
        buyerCity: body.buyerCity,
        buyerPostalCode: body.buyerPostalCode,
        buyerStreet: body.buyerStreet,
        sellerNip: asNip(env.KSEF_NIP),
        sellerName: "EcomPilot Seller",
        sellerCity: "Warszawa",
        sellerPostalCode: "00-001",
        sellerStreet: "ul. Testowa 1",
        items: body.items.map((item) => ({
          sku: item.sku ?? item.name,
          name: item.name,
          quantity: item.quantity,
          unitPriceGrosze: asGrosze(item.unitPriceGrosze),
          vatRate: item.vatRate,
        })),
        paymentMethod: body.paymentMethod,
        paymentDueDate: body.paymentDueDate,
        bankAccountIban: body.bankAccountIban,
        invoiceNumber,
        issueDate,
      };

      try {
        const { invoiceId, xml, jpkMarker } = await invoiceService.createInvoiceFromOrder(orderReq);

        await natsService.publishInvoiceCreated({
          invoiceId,
          userId,
          invoiceNumber,
          sellerNip: env.KSEF_NIP,
          buyerNip: body.buyerNip ?? null,
          netAmount: 0,
          vatAmount: 0,
          grossAmount: 0,
          jpkMarker,
          issueDate,
          createdAt: now.toISOString(),
        });

        logger.info({ userId, invoiceId, invoiceNumber }, "Invoice created");

        return reply.code(201).send({
          success: true,
          data: {
            invoiceId,
            invoiceNumber,
            jpkMarker,
            xmlSha256: xml.sha256,
            byteSize: xml.byteSize,
            generatedAt: xml.generatedAt,
          },
        });
      } catch (err) {
        logger.error({ err, userId }, "Failed to create invoice");
        return errorReply(reply, 500, "INTERNAL_ERROR", "Failed to create invoice");
      }
    },
  );

  // ── GET /api/v1/ksef/invoices — list invoices ──────────────────────────────

  fastify.get(
    "/api/v1/ksef/invoices",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthRequest;
      const userId = req.authUser!.sub;

      const queryResult = ListInvoicesQuerySchema.safeParse(req.query);
      if (!queryResult.success) {
        return errorReply(reply, 400, "VALIDATION_ERROR", "Invalid query parameters");
      }

      const { page, limit, status, invoiceType } = queryResult.data;
      const db = getDb();

      const conditions = [eq(invoices.userId, userId)];
      if (status !== undefined) conditions.push(eq(invoices.status, status));
      if (invoiceType !== undefined) conditions.push(eq(invoices.invoiceType, invoiceType));

      const rows = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          invoiceType: invoices.invoiceType,
          status: invoices.status,
          ksefNumber: invoices.ksefNumber,
          ksefReferenceNumber: invoices.ksefReferenceNumber,
          sellerNip: invoices.sellerNip,
          buyerNip: invoices.buyerNip,
          netAmount: invoices.netAmount,
          vatAmount: invoices.vatAmount,
          grossAmount: invoices.grossAmount,
          jpkMarker: invoices.jpkMarker,
          gtuCodes: invoices.gtuCodes,
          paymentMethod: invoices.paymentMethod,
          issueDate: invoices.issueDate,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .where(and(...conditions))
        .orderBy(desc(invoices.createdAt))
        .limit(limit)
        .offset((page - 1) * limit);

      return reply.code(200).send({ success: true, data: rows, meta: { page, limit } });
    },
  );

  // ── GET /api/v1/ksef/invoices/:id — get single invoice ────────────────────

  fastify.get<{ Params: { id: string } }>(
    "/api/v1/ksef/invoices/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthRequest & { params: { id: string } };
      const userId = req.authUser!.sub;
      const db = getDb();

      const rows = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, req.params.id), eq(invoices.userId, userId)))
        .limit(1);

      const invoice = rows[0];
      if (invoice === undefined) {
        return errorReply(reply, 404, "NOT_FOUND", "Invoice not found");
      }

      return reply.code(200).send({ success: true, data: invoice });
    },
  );

  // ── GET /api/v1/ksef/invoices/:id/xml — download FA(3) XML ────────────────

  fastify.get<{ Params: { id: string } }>(
    "/api/v1/ksef/invoices/:id/xml",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthRequest & { params: { id: string } };
      const userId = req.authUser!.sub;
      const db = getDb();

      const rows = await db
        .select({ xmlContent: invoices.xmlContent, invoiceNumber: invoices.invoiceNumber })
        .from(invoices)
        .where(and(eq(invoices.id, req.params.id), eq(invoices.userId, userId)))
        .limit(1);

      const invoice = rows[0];
      if (invoice === undefined) {
        return errorReply(reply, 404, "NOT_FOUND", "Invoice not found");
      }

      return reply
        .code(200)
        .header("Content-Type", "application/xml; charset=utf-8")
        .header(
          "Content-Disposition",
          `attachment; filename="invoice-${invoice.invoiceNumber.replace(/\//g, "-")}.xml"`,
        )
        .send(invoice.xmlContent);
    },
  );

  // ── GET /api/v1/ksef/invoices/:id/pdf — placeholder PDF ───────────────────
  // In production: generate PDF from XML using a templating engine or external service

  fastify.get<{ Params: { id: string } }>(
    "/api/v1/ksef/invoices/:id/pdf",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthRequest & { params: { id: string } };
      const userId = req.authUser!.sub;
      const db = getDb();

      const rows = await db
        .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, status: invoices.status })
        .from(invoices)
        .where(and(eq(invoices.id, req.params.id), eq(invoices.userId, userId)))
        .limit(1);

      const invoice = rows[0];
      if (invoice === undefined) {
        return errorReply(reply, 404, "NOT_FOUND", "Invoice not found");
      }

      // PDF generation would be handled by a separate PDF service
      return errorReply(reply, 501, "NOT_IMPLEMENTED", "PDF generation is handled by the PDF rendering service");
    },
  );

  // ── GET /api/v1/ksef/invoices/:id/upo — retrieve UPO ─────────────────────

  fastify.get<{ Params: { id: string } }>(
    "/api/v1/ksef/invoices/:id/upo",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthRequest & { params: { id: string } };
      const userId = req.authUser!.sub;
      const db = getDb();

      const rows = await db
        .select({
          ksefReferenceNumber: invoices.ksefReferenceNumber,
          status: invoices.status,
        })
        .from(invoices)
        .where(and(eq(invoices.id, req.params.id), eq(invoices.userId, userId)))
        .limit(1);

      const invoice = rows[0];
      if (invoice === undefined) {
        return errorReply(reply, 404, "NOT_FOUND", "Invoice not found");
      }

      if (invoice.ksefReferenceNumber === null || invoice.ksefReferenceNumber === undefined) {
        return errorReply(reply, 409, "CONFLICT", "Invoice has not been accepted by KSeF yet");
      }

      if (invoice.status !== "accepted") {
        return errorReply(reply, 409, "CONFLICT", `Invoice status is '${invoice.status}' — UPO only available for accepted invoices`);
      }

      try {
        // Session reference would be stored; using invoice ref as session ref for now
        const upo = await ksefClient.getUpo(invoice.ksefReferenceNumber, invoice.ksefReferenceNumber);

        return reply.code(200).send({ success: true, data: upo });
      } catch (err) {
        logger.error({ err, invoiceId: req.params.id }, "Failed to retrieve UPO from KSeF");
        return errorReply(reply, 502, "SERVICE_UNAVAILABLE", "Failed to retrieve UPO from KSeF");
      }
    },
  );

  // ── POST /api/v1/ksef/invoices/:id/submit — submit single invoice to KSeF ─

  fastify.post<{ Params: { id: string } }>(
    "/api/v1/ksef/invoices/:id/submit",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthRequest & { params: { id: string } };
      const userId = req.authUser!.sub;
      const db = getDb();

      const rows = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, req.params.id), eq(invoices.userId, userId)))
        .limit(1);

      const invoice = rows[0];
      if (invoice === undefined) {
        return errorReply(reply, 404, "NOT_FOUND", "Invoice not found");
      }

      if (invoice.status === "accepted" || invoice.status === "submitted") {
        return errorReply(reply, 409, "CONFLICT", `Invoice is already in status '${invoice.status}'`);
      }

      // Check KSeF availability
      const ksefStatus = await ksefClient.checkKsefStatus();
      if (!ksefStatus.available) {
        // Mark as offline
        const offlineResult = await offlineService.markAsOffline(invoice.id);
        logger.warn(
          { invoiceId: invoice.id, deadline: offlineResult.submissionDeadline },
          "KSeF unavailable — invoice marked as offline",
        );
        return reply.code(202).send({
          success: true,
          data: {
            status: "offline",
            jpkMarker: "OFF",
            submissionDeadline: offlineResult.submissionDeadline.toISOString(),
            message: "KSeF is currently unavailable. Invoice issued with OFF marker. Will be submitted within 7 days.",
          },
        });
      }

      try {
        const xmlDoc = {
          xmlContent: invoice.xmlContent,
          sha256: "",
          byteSize: Buffer.from(invoice.xmlContent, "utf-8").byteLength,
          generatedAt: invoice.createdAt.toISOString(),
        };

        // Open interactive session, submit, terminate
        const session = await ksefClient.openInteractiveSession(asNip(invoice.sellerNip));
        const result = await ksefClient.submitInvoice(xmlDoc, session.referenceNumber);
        await ksefClient.terminateSession(session.referenceNumber);

        // Update invoice record
        await db
          .update(invoices)
          .set({
            status: "accepted",
            ksefReferenceNumber: result.ksefReferenceNumber,
            ksefNumber: result.ksefReferenceNumber,
            jpkMarker: "NrKSeF",
            ksefAcceptedAt: new Date(result.ksefTimestamp),
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, invoice.id));

        await natsService.publishInvoiceAccepted({
          invoiceId: invoice.id,
          userId,
          invoiceNumber: invoice.invoiceNumber,
          ksefReferenceNumber: result.ksefReferenceNumber,
          ksefNumber: result.ksefReferenceNumber,
          ksefTimestamp: result.ksefTimestamp,
          acceptedAt: new Date().toISOString(),
        });

        logger.info(
          { invoiceId: invoice.id, ksefRef: result.ksefReferenceNumber },
          "Invoice submitted and accepted by KSeF",
        );

        return reply.code(200).send({
          success: true,
          data: {
            ksefReferenceNumber: result.ksefReferenceNumber,
            ksefTimestamp: result.ksefTimestamp,
            jpkMarker: "NrKSeF",
          },
        });
      } catch (err) {
        logger.error({ err, invoiceId: invoice.id }, "KSeF invoice submission failed");
        await db
          .update(invoices)
          .set({ status: "rejected", updatedAt: new Date() })
          .where(eq(invoices.id, invoice.id));

        return errorReply(reply, 502, "SERVICE_UNAVAILABLE", "KSeF invoice submission failed");
      }
    },
  );

  // ── POST /api/v1/ksef/invoices/batch-submit — batch submit ────────────────

  fastify.post(
    "/api/v1/ksef/invoices/batch-submit",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthRequest;
      const userId = req.authUser!.sub;

      const parseResult = BatchSubmitBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return errorReply(reply, 400, "VALIDATION_ERROR", "Invalid request body", parseResult.error.flatten());
      }

      const { invoiceIds } = parseResult.data;
      const db = getDb();

      const rows = await db
        .select({ id: invoices.id, xmlContent: invoices.xmlContent, status: invoices.status })
        .from(invoices)
        .where(eq(invoices.userId, userId));

      const targetRows = rows.filter((r) => invoiceIds.includes(r.id));
      if (targetRows.length === 0) {
        return errorReply(reply, 404, "NOT_FOUND", "No matching invoices found");
      }

      const eligibleRows = targetRows.filter(
        (r) => r.status === "draft" || r.status === "pending_ksef" || r.status === "offline",
      );

      if (eligibleRows.length === 0) {
        return errorReply(reply, 409, "CONFLICT", "All specified invoices are already submitted or accepted");
      }

      try {
        const xmlDocuments = eligibleRows.map((r) => r.xmlContent);
        const batchPackage = ksefClient.encryptBatchPackage(xmlDocuments);
        const batchResult = await ksefClient.openBatchSession(
          asNip(env.KSEF_NIP),
          batchPackage,
        );

        for (const row of eligibleRows) {
          await db
            .update(invoices)
            .set({ status: "submitted", updatedAt: new Date() })
            .where(eq(invoices.id, row.id));
        }

        logger.info(
          {
            batchReferenceNumber: batchResult.batchReferenceNumber,
            invoiceCount: eligibleRows.length,
          },
          "Batch submission to KSeF complete",
        );

        return reply.code(202).send({
          success: true,
          data: {
            batchReferenceNumber: batchResult.batchReferenceNumber,
            invoicesSubmitted: batchResult.invoicesSubmitted,
            status: batchResult.status,
          },
        });
      } catch (err) {
        logger.error({ err, userId }, "Batch submission to KSeF failed");
        return errorReply(reply, 502, "SERVICE_UNAVAILABLE", "Batch submission to KSeF failed");
      }
    },
  );

  // ── POST /api/v1/ksef/credentials — store credentials ────────────────────

  fastify.post(
    "/api/v1/ksef/credentials",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthRequest;
      const userId = req.authUser!.sub;

      const parseResult = CredentialsBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return errorReply(reply, 400, "VALIDATION_ERROR", "Invalid request body", parseResult.error.flatten());
      }

      const { environment, authMethod, nipNumber, token } = parseResult.data;
      const db = getDb();

      const encryptedToken = encryptToken(token);

      const [inserted] = await db
        .insert(ksefCredentials)
        .values({
          userId,
          environment,
          authMethod,
          nipNumber,
          encryptedToken,
        })
        .onConflictDoUpdate({
          target: [ksefCredentials.userId, ksefCredentials.environment],
          set: {
            authMethod,
            nipNumber,
            encryptedToken,
            updatedAt: new Date(),
          },
        })
        .returning({ id: ksefCredentials.id });

      logger.info({ userId, environment }, "KSeF credentials stored");

      return reply.code(201).send({
        success: true,
        data: { id: inserted?.id, environment, authMethod, nipNumber },
      });
    },
  );

  // ── GET /api/v1/ksef/credentials — list credentials ──────────────────────

  fastify.get(
    "/api/v1/ksef/credentials",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthRequest;
      const userId = req.authUser!.sub;
      const db = getDb();

      const rows = await db
        .select({
          id: ksefCredentials.id,
          environment: ksefCredentials.environment,
          authMethod: ksefCredentials.authMethod,
          nipNumber: ksefCredentials.nipNumber,
          createdAt: ksefCredentials.createdAt,
          updatedAt: ksefCredentials.updatedAt,
        })
        .from(ksefCredentials)
        .where(eq(ksefCredentials.userId, userId));

      return reply.code(200).send({ success: true, data: rows });
    },
  );

  // ── DELETE /api/v1/ksef/credentials — delete credentials ─────────────────

  fastify.delete<{ Params: { id: string } }>(
    "/api/v1/ksef/credentials/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthRequest & { params: { id: string } };
      const userId = req.authUser!.sub;
      const db = getDb();

      const rows = await db
        .delete(ksefCredentials)
        .where(and(eq(ksefCredentials.id, req.params.id), eq(ksefCredentials.userId, userId)))
        .returning({ id: ksefCredentials.id });

      if (rows.length === 0) {
        return errorReply(reply, 404, "NOT_FOUND", "Credentials not found");
      }

      logger.info({ userId, credentialId: req.params.id }, "KSeF credentials deleted");

      return reply.code(200).send({ success: true, data: { deleted: true } });
    },
  );

  // ── POST /api/v1/ksef/sessions/interactive — open interactive session ──────

  fastify.post(
    "/api/v1/ksef/sessions/interactive",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthRequest;
      const userId = req.authUser!.sub;
      const db = getDb();

      if (!ksefClient.isSessionActive()) {
        return errorReply(reply, 401, "AUTH_UNAUTHORIZED", "KSeF session token not active. Authenticate first.");
      }

      try {
        const session = await ksefClient.openInteractiveSession(asNip(env.KSEF_NIP));

        const [inserted] = await db
          .insert(ksefSessions)
          .values({
            userId,
            sessionType: "interactive",
            referenceNumber: session.referenceNumber,
            status: "active",
            environment: env.KSEF_ENVIRONMENT,
          })
          .returning({ id: ksefSessions.id });

        return reply.code(201).send({
          success: true,
          data: {
            sessionId: inserted?.id,
            referenceNumber: session.referenceNumber,
            sessionType: "interactive",
            status: "active",
            openedAt: session.openedAt,
          },
        });
      } catch (err) {
        logger.error({ err, userId }, "Failed to open KSeF interactive session");
        return errorReply(reply, 502, "SERVICE_UNAVAILABLE", "Failed to open KSeF session");
      }
    },
  );

  // ── POST /api/v1/ksef/sessions/batch — open batch session ─────────────────

  fastify.post(
    "/api/v1/ksef/sessions/batch",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthRequest;
      const userId = req.authUser!.sub;

      const parseResult = BatchSubmitBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return errorReply(reply, 400, "VALIDATION_ERROR", "Invalid request body", parseResult.error.flatten());
      }

      const { invoiceIds } = parseResult.data;
      const db = getDb();

      const rows = await db
        .select({ id: invoices.id, xmlContent: invoices.xmlContent })
        .from(invoices)
        .where(eq(invoices.userId, userId));

      const targetRows = rows.filter((r) => invoiceIds.includes(r.id));

      try {
        const xmlDocuments = targetRows.map((r) => r.xmlContent);
        const batchPackage = ksefClient.encryptBatchPackage(xmlDocuments);
        const batchResult = await ksefClient.openBatchSession(asNip(env.KSEF_NIP), batchPackage);

        const [inserted] = await db
          .insert(ksefSessions)
          .values({
            userId,
            sessionType: "batch",
            referenceNumber: batchResult.batchReferenceNumber,
            status: "active",
            environment: env.KSEF_ENVIRONMENT,
          })
          .returning({ id: ksefSessions.id });

        return reply.code(202).send({
          success: true,
          data: {
            sessionId: inserted?.id,
            batchReferenceNumber: batchResult.batchReferenceNumber,
            invoicesSubmitted: batchResult.invoicesSubmitted,
            status: batchResult.status,
          },
        });
      } catch (err) {
        logger.error({ err, userId }, "Failed to open KSeF batch session");
        return errorReply(reply, 502, "SERVICE_UNAVAILABLE", "Failed to open KSeF batch session");
      }
    },
  );

  // ── POST /api/v1/ksef/sessions/:id/close — close a session ────────────────

  fastify.post<{ Params: { id: string } }>(
    "/api/v1/ksef/sessions/:id/close",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthRequest & { params: { id: string } };
      const userId = req.authUser!.sub;
      const db = getDb();

      const rows = await db
        .select()
        .from(ksefSessions)
        .where(and(eq(ksefSessions.id, req.params.id), eq(ksefSessions.userId, userId)))
        .limit(1);

      const session = rows[0];
      if (session === undefined) {
        return errorReply(reply, 404, "NOT_FOUND", "Session not found");
      }

      if (session.status === "closed") {
        return errorReply(reply, 409, "CONFLICT", "Session is already closed");
      }

      try {
        await ksefClient.terminateSession(session.referenceNumber);

        await db
          .update(ksefSessions)
          .set({ status: "closed", closedAt: new Date() })
          .where(eq(ksefSessions.id, session.id));

        return reply.code(200).send({
          success: true,
          data: { sessionId: session.id, status: "closed", closedAt: new Date().toISOString() },
        });
      } catch (err) {
        logger.error({ err, sessionId: session.id }, "Failed to close KSeF session");
        return errorReply(reply, 502, "SERVICE_UNAVAILABLE", "Failed to close KSeF session");
      }
    },
  );

  // ── POST /api/v1/ksef/jpk/generate — trigger JPK_V7 report generation ─────

  fastify.post(
    "/api/v1/ksef/jpk/generate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthRequest;
      const userId = req.authUser!.sub;

      const parseResult = JpkGenerateBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return errorReply(reply, 400, "VALIDATION_ERROR", "Invalid request body", parseResult.error.flatten());
      }

      const { periodFrom, periodTo, jpkType } = parseResult.data;
      const db = getDb();

      // Fetch all accepted invoices in the period for this user
      const rows = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          ksefNumber: invoices.ksefNumber,
          netAmount: invoices.netAmount,
          vatAmount: invoices.vatAmount,
          grossAmount: invoices.grossAmount,
          jpkMarker: invoices.jpkMarker,
          issueDate: invoices.issueDate,
        })
        .from(invoices)
        .where(eq(invoices.userId, userId));

      const periodInvoices = rows.filter(
        (r) => r.issueDate >= periodFrom && r.issueDate <= periodTo,
      );

      logger.info(
        { userId, periodFrom, periodTo, jpkType, invoiceCount: periodInvoices.length },
        "JPK_V7 generation requested",
      );

      // In production this would invoke the JPK generation engine
      return reply.code(202).send({
        success: true,
        data: {
          reportId: crypto.randomUUID(),
          jpkType,
          periodFrom,
          periodTo,
          invoiceCount: periodInvoices.length,
          status: "processing",
          message: "JPK_V7 report generation queued. Download will be available shortly.",
        },
      });
    },
  );

  // ── GET /api/v1/ksef/gtu-codes — list GTU code descriptions ───────────────

  fastify.get(
    "/api/v1/ksef/gtu-codes",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const codes = Object.entries(GTU_DESCRIPTIONS).map(([code, description]) => ({
        code,
        description,
      }));

      return reply.code(200).send({ success: true, data: codes });
    },
  );

  // ── GET /api/v1/ksef/status — KSeF system availability ────────────────────

  fastify.get(
    "/api/v1/ksef/status",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const ksefStatus = await ksefClient.checkKsefStatus();

      const approaching = await offlineService.getApproachingDeadlines();

      return reply.code(200).send({
        success: true,
        data: {
          environment: env.KSEF_ENVIRONMENT,
          ksefAvailable: ksefStatus.available,
          ksefTimestamp: ksefStatus.timestamp,
          offlineInvoicesApproachingDeadline: approaching.length,
          deadlineAlerts: approaching.map((a) => ({
            invoiceId: a.id,
            invoiceNumber: a.invoiceNumber,
            hoursRemaining: a.hoursRemaining,
            deadline: a.deadline.toISOString(),
          })),
        },
      });
    },
  );
}
