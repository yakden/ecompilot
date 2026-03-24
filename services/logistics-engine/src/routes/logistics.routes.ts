// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — logistics-engine
// Logistics routes — Fastify 5.x with Zod validation
//
// Endpoints:
//   POST   /api/v1/logistics/shipments
//   GET    /api/v1/logistics/shipments
//   GET    /api/v1/logistics/shipments/:id
//   DELETE /api/v1/logistics/shipments/:id
//   GET    /api/v1/logistics/shipments/:id/label
//   POST   /api/v1/logistics/shipments/batch-labels
//   GET    /api/v1/logistics/tracking/:number
//   POST   /api/v1/logistics/returns/:orderId
//   GET    /api/v1/logistics/pickup-points
//   POST   /api/v1/logistics/pickup
//   GET    /api/v1/logistics/carriers
//   POST   /api/v1/logistics/carriers/credentials
//   PUT    /api/v1/logistics/carriers/credentials/:id
//   POST   /api/v1/webhooks/logistics/:carrier
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, desc, and, isNull } from "drizzle-orm";
import pg from "pg";
import { connect, type NatsConnection, StringCodec } from "nats";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Logger } from "pino";
import { Redis as IORedis } from "ioredis";
import { InPostPointsService } from "../services/inpost-points.service.js";
import { DhlTrackingService } from "../services/dhl-tracking.service.js";
import { PocztaTrackingService } from "../services/poczta-tracking.service.js";
import type { RedisCache } from "../services/redis-cache.js";
import {
  registerPublicTrackingRoutes,
  type PublicTrackingDeps,
} from "./public-tracking.routes.js";
import { shipments, trackingEvents, carrierCredentials } from "../db/schema.js";
import { InPostConnector } from "../connectors/inpost.connector.js";
import { DpdConnector } from "../connectors/dpd.connector.js";
import { DhlDomesticConnector, DhlExpressConnector } from "../connectors/dhl.connector.js";
import {
  ConnectorError,
  CARRIER_CODES,
  asTrackingNumber,
  asCarrierShipmentId,
  asPickupPointId,
  type CarrierCode,
  type CarrierConnector,
  type LabelFormat,
  type ShipmentRequest,
} from "../types/carrier.js";
import type { TrackingWorker } from "../services/tracking.worker.js";
import { env } from "../config/env.js";
import { requireAuth } from "@ecompilot/shared-auth";
import * as schema from "../db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas for request validation
// ─────────────────────────────────────────────────────────────────────────────

const AddressSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  company: z.string().max(100).optional(),
  street: z.string().min(1).max(150),
  buildingNumber: z.string().min(1).max(20),
  flatNumber: z.string().max(20).optional(),
  city: z.string().min(1).max(100),
  postalCode: z.string().min(3).max(10),
  countryCode: z.string().length(2).default("PL"),
  phone: z.string().min(9).max(20),
  email: z.string().email(),
});

const CodSchema = z.object({
  amount: z.number().positive().max(5_000),
  bankAccount: z.string().min(20).max(34),
  reference: z.string().max(100).optional(),
});

const DimensionsSchema = z.object({
  weightKg: z.number().positive().max(50),
  lengthCm: z.number().positive().max(400),
  widthCm: z.number().positive().max(400),
  heightCm: z.number().positive().max(400),
});

const CreateShipmentBodySchema = z.object({
  orderId: z.string().uuid(),
  carrier: z.enum(["inpost", "dpd", "dhl_domestic", "dhl_express", "orlen", "gls", "poczta_polska"]),
  receiver: AddressSchema,
  sender: AddressSchema.optional(),
  targetPickupPointId: z.string().optional(),
  dimensions: DimensionsSchema.optional(),
  parcelSize: z.enum(["A", "B", "C"]).optional(),
  cod: CodSchema.optional(),
  insuranceAmount: z.number().positive().max(100_000).optional(),
  labelFormat: z.enum(["PDF", "ZPL_200DPI", "ZPL_300DPI", "EPL", "PNG"]).default("PDF"),
  reference: z.string().max(255).optional(),
  serviceType: z.string().max(50).optional(),
  includeReturn: z.boolean().default(false),
  isLockerDelivery: z.boolean().default(false),
  meta: z.record(z.string()).optional(),
});

const ListShipmentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  carrier: z.enum(["inpost", "dpd", "dhl_domestic", "dhl_express", "orlen", "gls", "poczta_polska"]).optional(),
  status: z.enum(["created", "label_ready", "picked_up", "in_transit", "out_for_delivery", "ready_for_pickup", "delivered", "failed_delivery", "returned", "cancelled", "exception"]).optional(),
  orderId: z.string().uuid().optional(),
});

const BatchLabelsBodySchema = z.object({
  shipmentIds: z.array(z.string().uuid()).min(1).max(50),
  format: z.enum(["PDF", "ZPL_200DPI", "ZPL_300DPI", "EPL", "PNG"]).default("PDF"),
});

const ReturnBodySchema = z.object({
  originalTrackingNumber: z.string().min(1),
  reason: z.string().max(255).optional(),
  labelFormat: z.enum(["PDF", "ZPL_200DPI", "ZPL_300DPI", "EPL", "PNG"]).optional(),
});

const PickupPointsQuerySchema = z.object({
  carrier: z.enum(["inpost", "dpd", "dhl_domestic", "dhl_express", "orlen", "gls", "poczta_polska"]).default("inpost"),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  radiusKm: z.coerce.number().positive().max(50).default(5),
  limit: z.coerce.number().int().positive().max(200).default(50),
  type: z.enum(["parcel_locker", "parcel_locker_superpop", "pop", "post_office"]).optional(),
});

const SchedulePickupBodySchema = z.object({
  carrier: z.enum(["inpost", "dpd", "dhl_domestic", "dhl_express", "orlen", "gls", "poczta_polska"]),
  trackingNumbers: z.array(z.string().min(1)).min(1).max(100),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pickupTimeFrom: z.string().regex(/^\d{2}:\d{2}$/),
  pickupTimeTo: z.string().regex(/^\d{2}:\d{2}$/),
  contactPhone: z.string().min(9).max(20),
  additionalInfo: z.string().max(500).optional(),
});

const CarrierCredentialsBodySchema = z.object({
  carrier: z.enum(["inpost", "dpd", "dhl_domestic", "dhl_express", "orlen", "gls", "poczta_polska"]),
  apiToken: z.string().optional(),
  apiSecret: z.string().optional(),
  username: z.string().optional(),
  accountId: z.string().optional(),
  carrierOrganizationId: z.string().optional(),
  environment: z.enum(["sandbox", "production"]).default("production"),
  passwordExpiresAt: z.string().datetime().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Route context dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface LogisticsRouteDeps {
  readonly db: NodePgDatabase<typeof schema>;
  readonly s3: S3Client;
  readonly nats: NatsConnection;
  readonly connectors: Map<CarrierCode, CarrierConnector>;
  readonly trackingWorker: TrackingWorker;
  readonly logger: Logger;
  readonly redis: RedisCache;
  readonly publicTracking: PublicTrackingDeps;
}

// ─────────────────────────────────────────────────────────────────────────────
// NATS helpers
// ─────────────────────────────────────────────────────────────────────────────

const sc = StringCodec();

function publishEvent(
  nats: NatsConnection,
  subject: string,
  payload: unknown,
  logger: Logger,
): void {
  try {
    nats.publish(subject, sc.encode(JSON.stringify({
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      correlationId: crypto.randomUUID(),
      source: "logistics-engine",
      payload,
    })));
  } catch (err: unknown) {
    logger.warn({ err, subject }, "Failed to publish NATS event");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error response helper
// ─────────────────────────────────────────────────────────────────────────────

function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): FastifyReply {
  return reply.status(statusCode).send({
    error: { code, message, ...(details !== undefined && { details }) },
  });
}

function handleConnectorError(err: unknown, reply: FastifyReply, logger: Logger): FastifyReply {
  if (err instanceof ConnectorError) {
    logger.warn({ code: err.code, message: err.message }, "Carrier connector error");
    switch (err.code) {
      case "NOT_FOUND":
        return sendError(reply, 404, err.code, err.message);
      case "INVALID_REQUEST":
      case "VALIDATION_ERROR":
        return sendError(reply, 422, err.code, err.message);
      case "UNAUTHORIZED":
        return sendError(reply, 502, err.code, "Carrier authentication failed");
      case "RATE_LIMITED":
        return sendError(reply, 429, err.code, "Carrier rate limit exceeded");
      case "CIRCUIT_OPEN":
        return sendError(reply, 503, err.code, err.message);
      case "UNSUPPORTED_OPERATION":
        return sendError(reply, 501, err.code, err.message);
      case "LABEL_NOT_READY":
        return sendError(reply, 202, err.code, "Label not yet ready — retry shortly");
      default:
        return sendError(reply, 502, err.code, "Carrier API error");
    }
  }
  logger.error({ err }, "Unexpected error in logistics route");
  return sendError(reply, 500, "INTERNAL_ERROR", "Internal server error");
}

// ─────────────────────────────────────────────────────────────────────────────
// S3 label upload helper
// ─────────────────────────────────────────────────────────────────────────────

async function uploadLabelToS3(
  s3: S3Client,
  bucket: string,
  key: string,
  content: Buffer,
  mimeType: string,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: content,
      ContentType: mimeType,
      ServerSideEncryption: "AES256",
    }),
  );
  // Return a path-style URL (pre-signing is done separately per GET request)
  return `s3://${bucket}/${key}`;
}

async function getPresignedLabelUrl(
  s3: S3Client,
  bucket: string,
  key: string,
  expiresInSeconds = 3_600,
): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────────────────────────────────────────

export async function registerLogisticsRoutes(
  app: FastifyInstance,
  deps: LogisticsRouteDeps,
): Promise<void> {
  const { db, s3, nats, connectors, trackingWorker, logger } = deps;

  // ── Public tracking & InPost Points routes ────────────────────────────────
  await registerPublicTrackingRoutes(app, deps.publicTracking);

  // All non-public logistics routes require authentication
  app.addHook("preHandler", async (request, reply) => {
    // Public tracking and webhook routes skip auth
    const publicPrefixes = ["/api/v1/logistics/tracking/", "/api/v1/logistics/pickup-points", "/api/v1/logistics/carriers", "/api/v1/webhooks/"];
    const url = request.url.split("?")[0] ?? "";
    const isPublic = publicPrefixes.some((p) => url.startsWith(p));
    if (isPublic && request.method === "GET") return;
    if (url.startsWith("/api/v1/webhooks/")) return;
    await requireAuth(request, reply);
  });

  // ── POST /api/v1/logistics/shipments ───────────────────────────────────────
  app.post("/api/v1/logistics/shipments", async (req: FastifyRequest, reply: FastifyReply) => {
    const bodyParsed = CreateShipmentBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return sendError(reply, 400, "VALIDATION_ERROR", "Invalid request body", bodyParsed.error.errors);
    }
    const body = bodyParsed.data;

    const connector = connectors.get(body.carrier as CarrierCode);
    if (connector === undefined) {
      return sendError(reply, 422, "CARRIER_NOT_CONFIGURED", `Carrier '${body.carrier}' is not configured`);
    }

    const shipmentReq: ShipmentRequest = {
      orderId: body.orderId,
      receiver: body.receiver,
      sender: body.sender,
      targetPickupPointId: body.targetPickupPointId !== undefined
        ? asPickupPointId(body.targetPickupPointId)
        : undefined,
      dimensions: body.dimensions,
      parcelSize: body.parcelSize,
      cod: body.cod,
      insuranceAmount: body.insuranceAmount,
      labelFormat: body.labelFormat as LabelFormat,
      reference: body.reference,
      serviceType: body.serviceType,
      includeReturn: body.includeReturn,
      isLockerDelivery: body.isLockerDelivery,
      meta: body.meta,
    };

    let carrierResponse: Awaited<ReturnType<CarrierConnector["createShipment"]>>;
    try {
      carrierResponse = await connector.createShipment(shipmentReq);
    } catch (err: unknown) {
      return handleConnectorError(err, reply, logger);
    }

    // Persist shipment to DB
    const receiverJson = JSON.stringify(body.receiver);
    // NOTE: In production, receiverJson must be AES-256-GCM encrypted before insert
    // using the PiiService. Placeholder until PiiService is wired.
    const receiverEncrypted = Buffer.from(receiverJson).toString("base64");

    type ShipmentInsert = typeof shipments.$inferInsert;
    const shipmentValues: ShipmentInsert = {
      orderId: body.orderId,
      userId: request.authUser?.sub ?? "unknown", // Extracted from verified JWT
      carrier: body.carrier as ShipmentInsert["carrier"],
      carrierShipmentId: (carrierResponse.carrierShipmentId as string | null) ?? null,
      trackingNumber: (carrierResponse.trackingNumber as string | null) ?? null,
      status: (carrierResponse.status as ShipmentInsert["status"]) ?? "created",
      serviceType: body.serviceType ?? null,
      receiverEncrypted,
      isCod: body.cod !== undefined,
      codAmount: body.cod !== undefined ? body.cod.amount.toString() : null,
      codBankAccount: body.cod !== undefined ? body.cod.bankAccount : null,
      weightKg: body.dimensions !== undefined ? body.dimensions.weightKg.toString() : null,
      lengthCm: body.dimensions !== undefined ? body.dimensions.lengthCm.toString() : null,
      widthCm: body.dimensions !== undefined ? body.dimensions.widthCm.toString() : null,
      heightCm: body.dimensions !== undefined ? body.dimensions.heightCm.toString() : null,
      parcelSize: body.parcelSize ?? null,
      isLockerDelivery: body.isLockerDelivery,
      targetPickupPointId: body.targetPickupPointId ?? null,
      insuranceAmount: body.insuranceAmount !== undefined ? body.insuranceAmount.toString() : null,
      estimatedDeliveryAt: carrierResponse.estimatedDeliveryAt !== undefined
        ? new Date(carrierResponse.estimatedDeliveryAt)
        : null,
      reference: body.reference ?? null,
      rawCarrierResponse: carrierResponse.rawResponse as Record<string, unknown>,
    };

    const [newShipment] = await db
      .insert(shipments)
      .values(shipmentValues)
      .returning();

    if (newShipment === undefined) {
      return sendError(reply, 500, "DB_INSERT_FAILED", "Failed to persist shipment");
    }

    // Enqueue tracking polling job
    if (carrierResponse.trackingNumber !== undefined) {
      await trackingWorker.enqueueTrackingJob({
        shipmentId: newShipment.id,
        trackingNumber: carrierResponse.trackingNumber,
        carrier: body.carrier as CarrierCode,
        orderId: body.orderId,
        userId: newShipment.userId,
      });
    }

    // Publish NATS event
    publishEvent(nats, "logistics.shipment.created", {
      shipmentId: newShipment.id,
      orderId: body.orderId,
      carrier: body.carrier,
      trackingNumber: carrierResponse.trackingNumber,
      status: carrierResponse.status,
      labelUrl: carrierResponse.labelUrl,
      estimatedDeliveryAt: carrierResponse.estimatedDeliveryAt,
      createdAt: newShipment.createdAt.toISOString(),
    }, logger);

    return reply.status(201).send({ data: newShipment });
  });

  // ── GET /api/v1/logistics/shipments ────────────────────────────────────────
  app.get("/api/v1/logistics/shipments", async (req: FastifyRequest, reply: FastifyReply) => {
    const queryParsed = ListShipmentsQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return sendError(reply, 400, "VALIDATION_ERROR", "Invalid query parameters", queryParsed.error.errors);
    }
    const { page, pageSize, carrier, status, orderId } = queryParsed.data;
    const offset = (page - 1) * pageSize;

    const conditions = [isNull(shipments.deletedAt)];
    if (carrier !== undefined) {
      conditions.push(eq(shipments.carrier, carrier as typeof shipments.$inferSelect["carrier"]));
    }
    if (status !== undefined) {
      conditions.push(eq(shipments.status, status as typeof shipments.$inferSelect["status"]));
    }
    if (orderId !== undefined) {
      conditions.push(eq(shipments.orderId, orderId));
    }

    const rows = await db
      .select()
      .from(shipments)
      .where(and(...conditions))
      .orderBy(desc(shipments.createdAt))
      .limit(pageSize)
      .offset(offset);

    return reply.send({ data: rows, meta: { page, pageSize } });
  });

  // ── GET /api/v1/logistics/shipments/:id ────────────────────────────────────
  app.get("/api/v1/logistics/shipments/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    const [shipment] = await db
      .select()
      .from(shipments)
      .where(and(eq(shipments.id, id), isNull(shipments.deletedAt)))
      .limit(1);

    if (shipment === undefined) {
      return sendError(reply, 404, "NOT_FOUND", `Shipment ${id} not found`);
    }

    const events = await db
      .select()
      .from(trackingEvents)
      .where(eq(trackingEvents.shipmentId, id))
      .orderBy(desc(trackingEvents.occurredAt));

    return reply.send({ data: { ...shipment, trackingEvents: events } });
  });

  // ── DELETE /api/v1/logistics/shipments/:id ─────────────────────────────────
  app.delete("/api/v1/logistics/shipments/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    const [shipment] = await db
      .select()
      .from(shipments)
      .where(and(eq(shipments.id, id), isNull(shipments.deletedAt)))
      .limit(1);

    if (shipment === undefined) {
      return sendError(reply, 404, "NOT_FOUND", `Shipment ${id} not found`);
    }

    if (shipment.carrierShipmentId !== null && shipment.carrierShipmentId !== undefined) {
      const connector = connectors.get(shipment.carrier as CarrierCode);
      if (connector !== undefined) {
        try {
          await connector.cancelShipment(asCarrierShipmentId(shipment.carrierShipmentId));
        } catch (err: unknown) {
          if (err instanceof ConnectorError && err.code !== "NOT_FOUND") {
            return handleConnectorError(err, reply, logger);
          }
          logger.warn({ err, shipmentId: id }, "Carrier cancel failed — soft-deleting anyway");
        }
      }
    }

    await db
      .update(shipments)
      .set({
        status: "cancelled",
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, id));

    return reply.status(204).send();
  });

  // ── GET /api/v1/logistics/shipments/:id/label ──────────────────────────────
  app.get("/api/v1/logistics/shipments/:id/label", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { format?: string; download?: string };
    const format: LabelFormat = (query.format as LabelFormat) ?? "PDF";

    const [shipment] = await db
      .select()
      .from(shipments)
      .where(and(eq(shipments.id, id), isNull(shipments.deletedAt)))
      .limit(1);

    if (shipment === undefined) {
      return sendError(reply, 404, "NOT_FOUND", `Shipment ${id} not found`);
    }

    // If label already stored in S3 — return presigned URL
    if (shipment.labelS3Url !== null && shipment.labelS3Url !== undefined && shipment.labelS3Url.startsWith("s3://")) {
      const [, , ...rest] = shipment.labelS3Url.split("/");
      const bucket = rest[0];
      const key = rest.slice(1).join("/");
      if (bucket !== undefined && key !== "") {
        const url = await getPresignedLabelUrl(s3, bucket, key);
        if (query.download === "true") {
          return reply.redirect(url);
        }
        return reply.send({ data: { presignedUrl: url, expiresInSeconds: 3600 } });
      }
    }

    // Fetch fresh from carrier
    if (shipment.carrierShipmentId === null || shipment.carrierShipmentId === undefined) {
      return sendError(reply, 422, "LABEL_NOT_READY", "Carrier shipment ID not yet assigned");
    }

    const connector = connectors.get(shipment.carrier as CarrierCode);
    if (connector === undefined) {
      return sendError(reply, 422, "CARRIER_NOT_CONFIGURED", "Carrier connector not available");
    }

    let label: Awaited<ReturnType<CarrierConnector["getLabel"]>>;
    try {
      label = await connector.getLabel(asCarrierShipmentId(shipment.carrierShipmentId), format);
    } catch (err: unknown) {
      return handleConnectorError(err, reply, logger);
    }

    // Upload to S3
    const s3Key = `labels/${shipment.carrier}/${id}/${label.trackingNumber}.${format.toLowerCase().replace("_", "")}`;
    const s3Url = await uploadLabelToS3(s3, env.AWS_S3_BUCKET, s3Key, label.content, label.mimeType);

    await db
      .update(shipments)
      .set({ labelS3Url: s3Url, labelFormat: format as typeof shipments.$inferSelect["labelFormat"], updatedAt: new Date() })
      .where(eq(shipments.id, id));

    publishEvent(nats, "logistics.label.ready", {
      shipmentId: id,
      trackingNumber: shipment.trackingNumber,
      labelS3Url: s3Url,
      format,
    }, logger);

    reply.header("Content-Type", label.mimeType);
    reply.header("Content-Disposition", `attachment; filename="label-${label.trackingNumber}.${format.toLowerCase()}"`);
    return reply.send(label.content);
  });

  // ── POST /api/v1/logistics/shipments/batch-labels ──────────────────────────
  app.post("/api/v1/logistics/shipments/batch-labels", async (req: FastifyRequest, reply: FastifyReply) => {
    const bodyParsed = BatchLabelsBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return sendError(reply, 400, "VALIDATION_ERROR", "Invalid request body", bodyParsed.error.errors);
    }
    const { shipmentIds, format } = bodyParsed.data;

    const rows = await db
      .select()
      .from(shipments)
      .where(isNull(shipments.deletedAt));

    const filtered = rows.filter((s) => shipmentIds.includes(s.id));
    if (filtered.length === 0) {
      return sendError(reply, 404, "NOT_FOUND", "No matching shipments found");
    }

    // Group by carrier — batch label download is per-carrier
    const byCarrier = new Map<CarrierCode, typeof filtered>();
    for (const s of filtered) {
      const carrier = s.carrier as CarrierCode;
      if (!byCarrier.has(carrier)) byCarrier.set(carrier, []);
      byCarrier.get(carrier)!.push(s);
    }

    const results: Array<{ carrier: string; labelUrl?: string; error?: string }> = [];

    for (const [carrier, carrierShipments] of byCarrier) {
      const connector = connectors.get(carrier);
      if (connector === undefined) {
        results.push({ carrier, error: "Connector not configured" });
        continue;
      }

      const ids = carrierShipments
        .filter((s) => s.carrierShipmentId !== null && s.carrierShipmentId !== undefined)
        .map((s) => asCarrierShipmentId(s.carrierShipmentId!));

      if (ids.length === 0) {
        results.push({ carrier, error: "No valid carrier shipment IDs" });
        continue;
      }

      try {
        const label = await connector.getBatchLabels(ids, format as LabelFormat);
        const s3Key = `labels/${carrier}/batch/${Date.now()}-batch.${format.toLowerCase().replace("_", "")}`;
        const s3Url = await uploadLabelToS3(s3, env.AWS_S3_BUCKET, s3Key, label.content, label.mimeType);
        const presigned = await getPresignedLabelUrl(s3, env.AWS_S3_BUCKET, s3Key);
        results.push({ carrier, labelUrl: presigned });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ carrier, error: msg });
      }
    }

    return reply.send({ data: results });
  });

  // ── GET /api/v1/logistics/tracking/:number ─────────────────────────────────
  app.get("/api/v1/logistics/tracking/:number", async (req: FastifyRequest, reply: FastifyReply) => {
    const { number: trackingNumber } = req.params as { number: string };

    // Try DB first
    const dbEvents = await db
      .select()
      .from(trackingEvents)
      .where(eq(trackingEvents.trackingNumber, trackingNumber))
      .orderBy(desc(trackingEvents.occurredAt));

    if (dbEvents.length > 0) {
      const latest = dbEvents[0];
      return reply.send({
        data: {
          trackingNumber,
          carrier: latest?.carrier,
          currentStatus: latest?.status,
          events: dbEvents,
          source: "cache",
        },
      });
    }

    // Try live InPost public tracking (no auth)
    const inpostConnector = connectors.get("inpost") as InPostConnector | undefined;
    if (inpostConnector !== undefined) {
      try {
        const result = await inpostConnector.getTracking(asTrackingNumber(trackingNumber));
        return reply.send({ data: { ...result, source: "live" } });
      } catch (err: unknown) {
        if (err instanceof ConnectorError && err.code !== "NOT_FOUND") {
          return handleConnectorError(err, reply, logger);
        }
      }
    }

    return sendError(reply, 404, "NOT_FOUND", `No tracking data found for ${trackingNumber}`);
  });

  // ── POST /api/v1/logistics/returns/:orderId ────────────────────────────────
  app.post("/api/v1/logistics/returns/:orderId", async (req: FastifyRequest, reply: FastifyReply) => {
    const { orderId } = req.params as { orderId: string };
    const bodyParsed = ReturnBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return sendError(reply, 400, "VALIDATION_ERROR", "Invalid request body", bodyParsed.error.errors);
    }
    const body = bodyParsed.data;

    // Find the most recent delivered shipment for this order
    const [shipment] = await db
      .select()
      .from(shipments)
      .where(and(eq(shipments.orderId, orderId), isNull(shipments.deletedAt)))
      .orderBy(desc(shipments.createdAt))
      .limit(1);

    if (shipment === undefined) {
      return sendError(reply, 404, "NOT_FOUND", `No shipment found for order ${orderId}`);
    }

    const connector = connectors.get(shipment.carrier as CarrierCode);
    if (connector === undefined) {
      return sendError(reply, 422, "CARRIER_NOT_CONFIGURED", "Carrier connector not available");
    }
    if (connector.createReturn === undefined) {
      return sendError(reply, 501, "UNSUPPORTED_OPERATION", `Carrier ${shipment.carrier} does not support returns`);
    }

    let returnResult: Awaited<ReturnType<NonNullable<CarrierConnector["createReturn"]>>>;
    try {
      returnResult = await connector.createReturn({
        originalTrackingNumber: asTrackingNumber(body.originalTrackingNumber),
        orderId,
        reason: body.reason,
        labelFormat: body.labelFormat as LabelFormat | undefined,
      });
    } catch (err: unknown) {
      return handleConnectorError(err, reply, logger);
    }

    publishEvent(nats, "logistics.shipment.returned", {
      shipmentId: shipment.id,
      orderId,
      returnTrackingNumber: returnResult.returnTrackingNumber,
      qrCodeUrl: returnResult.qrCodeUrl,
    }, logger);

    return reply.status(201).send({ data: returnResult });
  });

  // ── GET /api/v1/logistics/pickup-points ────────────────────────────────────
  app.get("/api/v1/logistics/pickup-points", async (req: FastifyRequest, reply: FastifyReply) => {
    const queryParsed = PickupPointsQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return sendError(reply, 400, "VALIDATION_ERROR", "Invalid query parameters", queryParsed.error.errors);
    }
    const { carrier, ...params } = queryParsed.data;

    const connector = connectors.get(carrier as CarrierCode);
    if (connector === undefined) {
      return sendError(reply, 422, "CARRIER_NOT_CONFIGURED", `Carrier '${carrier}' is not configured`);
    }
    if (connector.getPickupPoints === undefined) {
      return sendError(reply, 501, "UNSUPPORTED_OPERATION", `Carrier ${carrier} does not support pickup point lookup`);
    }

    try {
      const points = await connector.getPickupPoints({
        city: params.city,
        postalCode: params.postalCode,
        latitude: params.latitude,
        longitude: params.longitude,
        radiusKm: params.radiusKm,
        type: params.type as Parameters<NonNullable<CarrierConnector["getPickupPoints"]>>[0]["type"],
        limit: params.limit,
      });
      return reply.send({ data: points, meta: { count: points.length } });
    } catch (err: unknown) {
      return handleConnectorError(err, reply, logger);
    }
  });

  // ── POST /api/v1/logistics/pickup ──────────────────────────────────────────
  app.post("/api/v1/logistics/pickup", async (req: FastifyRequest, reply: FastifyReply) => {
    const bodyParsed = SchedulePickupBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return sendError(reply, 400, "VALIDATION_ERROR", "Invalid request body", bodyParsed.error.errors);
    }
    const body = bodyParsed.data;

    const connector = connectors.get(body.carrier as CarrierCode);
    if (connector === undefined) {
      return sendError(reply, 422, "CARRIER_NOT_CONFIGURED", `Carrier '${body.carrier}' is not configured`);
    }
    if (connector.schedulePickup === undefined) {
      return sendError(reply, 501, "UNSUPPORTED_OPERATION", `Carrier ${body.carrier} does not support pickup scheduling`);
    }

    try {
      const result = await connector.schedulePickup({
        trackingNumbers: body.trackingNumbers.map(asTrackingNumber),
        pickupDate: body.pickupDate,
        pickupTimeFrom: body.pickupTimeFrom,
        pickupTimeTo: body.pickupTimeTo,
        contactPhone: body.contactPhone,
        additionalInfo: body.additionalInfo,
      });
      return reply.status(201).send({ data: result });
    } catch (err: unknown) {
      return handleConnectorError(err, reply, logger);
    }
  });

  // ── GET /api/v1/logistics/carriers ─────────────────────────────────────────
  app.get("/api/v1/logistics/carriers", async (_req: FastifyRequest, reply: FastifyReply) => {
    const carriersInfo = CARRIER_CODES.map((code) => {
      const connector = connectors.get(code);
      return {
        code,
        isConfigured: connector !== undefined,
        isImplemented: connector?.capabilities.isImplemented ?? false,
        capabilities: connector?.capabilities ?? null,
      };
    });
    return reply.send({ data: carriersInfo });
  });

  // ── POST /api/v1/logistics/carriers/credentials ────────────────────────────
  app.post("/api/v1/logistics/carriers/credentials", async (req: FastifyRequest, reply: FastifyReply) => {
    const bodyParsed = CarrierCredentialsBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return sendError(reply, 400, "VALIDATION_ERROR", "Invalid request body", bodyParsed.error.errors);
    }
    const body = bodyParsed.data;

    // NOTE: In production, all sensitive fields must be AES-256-GCM encrypted
    // via PiiService before persistence. Placeholder base64 encoding here.
    const encrypt = (val: string | undefined): string | null =>
      val !== undefined ? Buffer.from(val).toString("base64") : null;

    const [cred] = await db
      .insert(carrierCredentials)
      .values({
        organizationId: crypto.randomUUID(), // TODO: from auth context
        carrier: body.carrier as typeof carrierCredentials.$inferInsert["carrier"],
        apiTokenEncrypted: encrypt(body.apiToken),
        apiSecretEncrypted: encrypt(body.apiSecret),
        usernameEncrypted: encrypt(body.username),
        accountIdEncrypted: encrypt(body.accountId),
        carrierOrganizationId: body.carrierOrganizationId ?? null,
        environment: body.environment,
        passwordExpiresAt: body.passwordExpiresAt !== undefined
          ? new Date(body.passwordExpiresAt)
          : null,
      })
      .returning({
        id: carrierCredentials.id,
        carrier: carrierCredentials.carrier,
        environment: carrierCredentials.environment,
        isActive: carrierCredentials.isActive,
        passwordExpiresAt: carrierCredentials.passwordExpiresAt,
        createdAt: carrierCredentials.createdAt,
      });

    return reply.status(201).send({ data: cred });
  });

  // ── PUT /api/v1/logistics/carriers/credentials/:id ─────────────────────────
  app.put("/api/v1/logistics/carriers/credentials/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const bodyParsed = CarrierCredentialsBodySchema.partial().safeParse(req.body);
    if (!bodyParsed.success) {
      return sendError(reply, 400, "VALIDATION_ERROR", "Invalid request body", bodyParsed.error.errors);
    }
    const body = bodyParsed.data;

    const [existing] = await db
      .select({ id: carrierCredentials.id })
      .from(carrierCredentials)
      .where(eq(carrierCredentials.id, id))
      .limit(1);

    if (existing === undefined) {
      return sendError(reply, 404, "NOT_FOUND", `Carrier credentials ${id} not found`);
    }

    const encrypt = (val: string | undefined): string | null | undefined =>
      val !== undefined ? Buffer.from(val).toString("base64") : undefined;

    const updateFields: Partial<typeof carrierCredentials.$inferInsert> = {
      updatedAt: new Date(),
      ...(body.apiToken !== undefined && { apiTokenEncrypted: encrypt(body.apiToken) ?? null }),
      ...(body.apiSecret !== undefined && { apiSecretEncrypted: encrypt(body.apiSecret) ?? null }),
      ...(body.username !== undefined && { usernameEncrypted: encrypt(body.username) ?? null }),
      ...(body.accountId !== undefined && { accountIdEncrypted: encrypt(body.accountId) ?? null }),
      ...(body.carrierOrganizationId !== undefined && { carrierOrganizationId: body.carrierOrganizationId }),
      ...(body.environment !== undefined && { environment: body.environment }),
      ...(body.passwordExpiresAt !== undefined && {
        passwordExpiresAt: new Date(body.passwordExpiresAt),
      }),
    };

    const [updated] = await db
      .update(carrierCredentials)
      .set(updateFields)
      .where(eq(carrierCredentials.id, id))
      .returning({
        id: carrierCredentials.id,
        carrier: carrierCredentials.carrier,
        environment: carrierCredentials.environment,
        isActive: carrierCredentials.isActive,
        passwordExpiresAt: carrierCredentials.passwordExpiresAt,
        updatedAt: carrierCredentials.updatedAt,
      });

    return reply.send({ data: updated });
  });

  // ── POST /api/v1/webhooks/logistics/:carrier ───────────────────────────────
  app.post("/api/v1/webhooks/logistics/:carrier", async (req: FastifyRequest, reply: FastifyReply) => {
    const { carrier } = req.params as { carrier: string };

    if (!CARRIER_CODES.includes(carrier as CarrierCode)) {
      return sendError(reply, 400, "UNKNOWN_CARRIER", `Unknown carrier: ${carrier}`);
    }

    const payload = req.body as Record<string, unknown>;

    logger.info(
      { carrier, payloadKeys: Object.keys(payload) },
      "Received logistics webhook",
    );

    // ── InPost webhook processing ────────────────────────────────────────────
    if (carrier === "inpost") {
      await processInPostWebhook(payload, db, nats, trackingWorker, logger);
      return reply.status(200).send({ received: true });
    }

    // Other carriers: acknowledge and log
    logger.info({ carrier, payload }, "Webhook received for carrier (no handler yet)");
    return reply.status(200).send({ received: true });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// InPost webhook handler
//
// InPost pushes status updates via webhooks configured in the ShipX dashboard.
// Payload: { shipment_id, status, tracking_number, ... }
// ─────────────────────────────────────────────────────────────────────────────

async function processInPostWebhook(
  payload: Record<string, unknown>,
  db: NodePgDatabase<typeof schema>,
  nats: NatsConnection,
  trackingWorker: TrackingWorker,
  logger: Logger,
): Promise<void> {
  const WebhookSchema = z.object({
    id: z.string().optional(),
    status: z.string(),
    tracking_number: z.string().optional(),
    shipment_id: z.string().optional(),
    href: z.string().optional(),
  });

  const parsed = WebhookSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn({ payload, errors: parsed.error.errors }, "Invalid InPost webhook payload");
    return;
  }

  const { status, tracking_number, shipment_id } = parsed.data;

  if (tracking_number === undefined && shipment_id === undefined) {
    logger.warn({ payload }, "InPost webhook missing tracking_number and shipment_id");
    return;
  }

  const conditions = [];
  if (tracking_number !== undefined) {
    conditions.push(eq(shipments.trackingNumber, tracking_number));
  } else if (shipment_id !== undefined) {
    conditions.push(eq(shipments.carrierShipmentId, shipment_id));
  }

  const [shipment] = await db
    .select()
    .from(shipments)
    .where(and(...conditions))
    .limit(1);

  if (shipment === undefined) {
    logger.warn({ tracking_number, shipment_id }, "InPost webhook: shipment not found in DB");
    return;
  }

  const normStatus = mapInPostWebhookStatus(status);

  await db
    .update(shipments)
    .set({
      status: normStatus as typeof shipments.$inferSelect["status"],
      updatedAt: new Date(),
    })
    .where(eq(shipments.id, shipment.id));

  if (tracking_number !== undefined) {
    await db.insert(trackingEvents).values({
      shipmentId: shipment.id,
      trackingNumber: tracking_number,
      carrier: "inpost",
      status: normStatus as typeof trackingEvents.$inferInsert["status"],
      rawStatus: status,
      occurredAt: new Date(),
    }).onConflictDoNothing();
  }

  publishEvent(nats, "logistics.tracking.updated", {
    shipmentId: shipment.id,
    orderId: shipment.orderId,
    trackingNumber: tracking_number ?? shipment.trackingNumber,
    carrier: "inpost",
    trackingStatus: normStatus,
    updatedAt: new Date().toISOString(),
  }, logger);

  if (normStatus === "delivered") {
    publishEvent(nats, "logistics.shipment.delivered", {
      shipmentId: shipment.id,
      orderId: shipment.orderId,
      deliveredAt: new Date().toISOString(),
    }, logger);
  }

  logger.info(
    { shipmentId: shipment.id, trackingNumber: tracking_number, status: normStatus },
    "InPost webhook processed",
  );
}

// Reuse status map inline for webhook
const INPOST_STATUS_MAP: Record<string, string> = {
  created: "created",
  confirmed: "label_ready",
  dispatched_by_sender: "picked_up",
  collected_from_sender: "picked_up",
  taken_by_courier: "picked_up",
  adopted_at_source_branch: "in_transit",
  sent_from_source_branch: "in_transit",
  adopted_at_sorting_center: "in_transit",
  sent_from_sorting_center: "in_transit",
  out_for_delivery: "out_for_delivery",
  ready_to_pickup: "ready_for_pickup",
  delivered: "delivered",
  picked_up_by_receiver: "delivered",
  returned_to_sender: "returned",
  canceled: "cancelled",
};

function mapInPostWebhookStatus(raw: string): string {
  return INPOST_STATUS_MAP[raw.toLowerCase()] ?? "exception";
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency factory — creates all route dependencies from env
// ─────────────────────────────────────────────────────────────────────────────

export async function createLogisticsDeps(
  logger: Logger,
  trackingWorker: TrackingWorker,
): Promise<LogisticsRouteDeps> {
  // ── Database ─────────────────────────────────────────────────────────────
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
  const db = drizzle(pool, { schema }) as NodePgDatabase<typeof schema>;

  // ── S3 ───────────────────────────────────────────────────────────────────
  const s3 = new S3Client({
    region: env.AWS_REGION,
    ...(env.AWS_ACCESS_KEY_ID !== undefined && env.AWS_SECRET_ACCESS_KEY !== undefined && {
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    }),
  });

  // ── NATS ─────────────────────────────────────────────────────────────────
  const nats = await connect({ servers: env.NATS_URL });

  // ── Connectors ────────────────────────────────────────────────────────────
  const connectors = new Map<CarrierCode, CarrierConnector>();

  if (env.INPOST_API_TOKEN !== undefined && env.INPOST_ORGANIZATION_ID !== undefined) {
    connectors.set(
      "inpost",
      new InPostConnector(
        {
          apiToken: env.INPOST_API_TOKEN,
          organizationId: env.INPOST_ORGANIZATION_ID,
          baseUrl: env.INPOST_API_BASE_URL,
          cbFailureThreshold: env.CB_FAILURE_THRESHOLD,
          cbRecoveryTimeoutMs: env.CB_RECOVERY_TIMEOUT_MS,
        },
        logger,
      ),
    );
  }

  if (env.DPD_LOGIN !== undefined && env.DPD_PASSWORD !== undefined && env.DPD_FID !== undefined) {
    connectors.set(
      "dpd",
      new DpdConnector(
        { login: env.DPD_LOGIN, password: env.DPD_PASSWORD, masterFid: env.DPD_FID },
        logger,
      ),
    );
  }

  if (env.DHL_API_KEY !== undefined) {
    connectors.set("dhl_domestic", new DhlDomesticConnector({ dhl24Login: env.DHL24_ACCOUNT_ID, dhl24Password: env.DHL_API_KEY }, logger));
    connectors.set("dhl_express", new DhlExpressConnector({ expressApiKey: env.DHL_API_KEY, expressApiSecret: env.DHL_API_SECRET }, logger));
  }

  logger.info(
    { configuredCarriers: [...connectors.keys()] },
    "Logistics carrier connectors initialized",
  );

  // ── Redis ─────────────────────────────────────────────────────────────────
  // Used by public tracking services for caching.
  const redis = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  await redis.connect();

  // ── Public tracking services ───────────────────────────────────────────────
  const inpostPoints = new InPostPointsService(redis, logger);
  const dhlTracking = new DhlTrackingService(redis, logger, env.DHL_API_KEY);
  const pocztaTracking = new PocztaTrackingService(redis, logger);

  const publicTracking: PublicTrackingDeps = {
    inpostPoints,
    dhlTracking,
    pocztaTracking,
    logger,
  };

  logger.info("Public tracking services (InPost Points, DHL, Poczta Polska) initialized");

  return { db, s3, nats, connectors, trackingWorker, logger, redis, publicTracking };
}
