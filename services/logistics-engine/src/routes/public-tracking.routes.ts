// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — logistics-engine
// Public Tracking & InPost Points Routes
//
// Endpoints:
//   GET  /api/v1/logistics/paczkomaty
//   GET  /api/v1/logistics/paczkomaty/:name
//   GET  /api/v1/logistics/track-dhl/:trackingNumber
//   GET  /api/v1/logistics/track-poczta/:number
//   GET  /api/v1/logistics/track/:number          ← unified auto-detect
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Logger } from "pino";
import { InPostPointsService } from "../services/inpost-points.service.js";
import { DhlTrackingService } from "../services/dhl-tracking.service.js";
import { PocztaTrackingService } from "../services/poczta-tracking.service.js";
import type { InPostPointType } from "../services/inpost-points.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Route dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface PublicTrackingDeps {
  readonly inpostPoints: InPostPointsService;
  readonly dhlTracking: DhlTrackingService;
  readonly pocztaTracking: PocztaTrackingService;
  readonly logger: Logger;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query / param validation schemas
// ─────────────────────────────────────────────────────────────────────────────

const PaczkomatyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().positive().max(50_000).default(5_000),
  type: z.enum(["parcel_locker", "pop", "parcel_locker_superpop"]).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Error response helper (local, avoids cross-file coupling)
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

// ─────────────────────────────────────────────────────────────────────────────
// Carrier auto-detection
// ─────────────────────────────────────────────────────────────────────────────

type DetectedCarrier = "inpost" | "dhl" | "poczta" | "unknown";

/**
 * Heuristically detect carrier from tracking number format.
 *
 * - InPost: starts with digit, 24+ chars (e.g. "642000012345678901234567")
 * - Poczta Polska: starts with R/C/E + 2 uppercase letters + 9 digits + "PL"
 *   e.g. "RE123456789PL"
 * - DHL: 10–39 chars, alphanumeric (fallback after Poczta check)
 */
function detectCarrier(number: string): DetectedCarrier {
  const pocztaRegex = /^[RCE][A-Z]{2}\d{9}PL$/i;
  if (pocztaRegex.test(number)) return "poczta";

  if (/^\d/.test(number) && number.length >= 24) return "inpost";

  if (number.length >= 10 && number.length <= 39 && /^[A-Za-z0-9]+$/.test(number)) {
    return "dhl";
  }

  return "unknown";
}

// ─────────────────────────────────────────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────────────────────────────────────────

export async function registerPublicTrackingRoutes(
  app: FastifyInstance,
  deps: PublicTrackingDeps,
): Promise<void> {
  const { inpostPoints, dhlTracking, pocztaTracking, logger } = deps;

  // ── GET /api/v1/logistics/paczkomaty ───────────────────────────────────────
  //
  // Find InPost Paczkomat / POP points near a coordinate.
  // Query: lat, lng, radius (metres, default 5000), type (optional filter)
  //
  app.get("/api/v1/logistics/paczkomaty", async (req: FastifyRequest, reply: FastifyReply) => {
    const queryParsed = PaczkomatyQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return sendError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Invalid query parameters",
        queryParsed.error.errors,
      );
    }

    const { lat, lng, radius, type } = queryParsed.data;

    const query =
      type !== undefined
        ? { lat, lng, radius, type: type as InPostPointType }
        : { lat, lng, radius };

    const result = await inpostPoints.findNearby(query);

    return reply.send(result);
  });

  // ── GET /api/v1/logistics/paczkomaty/:name ─────────────────────────────────
  //
  // Get a single InPost point by its identifier (e.g. "WAW123M").
  //
  app.get(
    "/api/v1/logistics/paczkomaty/:name",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { name } = req.params as { name: string };

      if (name.length < 3 || name.length > 20) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Point name must be 3–20 characters");
      }

      const point = await inpostPoints.findByName(name);
      if (point === null) {
        return sendError(
          reply,
          404,
          "NOT_FOUND",
          `InPost point '${name.toUpperCase()}' not found`,
        );
      }

      return reply.send({ point });
    },
  );

  // ── GET /api/v1/logistics/track-dhl/:trackingNumber ───────────────────────
  //
  // Track a single DHL shipment. Returns { found: false } if unavailable or
  // DHL_API_KEY is not configured.
  //
  app.get(
    "/api/v1/logistics/track-dhl/:trackingNumber",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { trackingNumber } = req.params as { trackingNumber: string };

      if (trackingNumber.length < 5 || trackingNumber.length > 50) {
        return sendError(
          reply,
          400,
          "VALIDATION_ERROR",
          "Tracking number must be 5–50 characters",
        );
      }

      const result = await dhlTracking.track(trackingNumber);
      return reply.send(result);
    },
  );

  // ── GET /api/v1/logistics/track-poczta/:number ────────────────────────────
  //
  // Track a Poczta Polska shipment.
  //
  app.get(
    "/api/v1/logistics/track-poczta/:number",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { number } = req.params as { number: string };

      if (number.length < 5 || number.length > 30) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Tracking number must be 5–30 characters");
      }

      const result = await pocztaTracking.track(number);
      return reply.send(result);
    },
  );

  // ── GET /api/v1/logistics/track/:number ───────────────────────────────────
  //
  // Unified auto-detect tracking endpoint. Detects carrier from number format
  // and delegates to the appropriate service. Falls back to trying all carriers
  // when carrier cannot be determined.
  //
  app.get(
    "/api/v1/logistics/track/:number",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { number } = req.params as { number: string };

      if (number.length < 5 || number.length > 50) {
        return sendError(reply, 400, "VALIDATION_ERROR", "Tracking number must be 5–50 characters");
      }

      const carrier = detectCarrier(number);

      logger.info({ number, detectedCarrier: carrier }, "Unified tracking lookup");

      switch (carrier) {
        case "poczta": {
          const result = await pocztaTracking.track(number);
          return reply.send({ carrier: "poczta_polska", ...result });
        }

        case "inpost": {
          // InPost public tracking uses the easypack24 Points API by name
          // which is a lookup, not an event-stream tracker.
          // Return not-found with a helpful hint — the internal
          // /api/v1/logistics/tracking/:number endpoint handles InPost events
          // via the connector.
          return reply.send({
            carrier: "inpost",
            found: false,
            hint: "Use GET /api/v1/logistics/tracking/:number for InPost shipment tracking",
          });
        }

        case "dhl": {
          const result = await dhlTracking.track(number);
          return reply.send({ carrier: "dhl", ...result });
        }

        default: {
          // Unknown carrier — try Poczta then DHL (InPost requires API token)
          const pocztaResult = await pocztaTracking.track(number);
          if (pocztaResult.found) {
            return reply.send({ carrier: "poczta_polska", ...pocztaResult });
          }

          const dhlResult = await dhlTracking.track(number);
          if (dhlResult.found) {
            return reply.send({ carrier: "dhl", ...dhlResult });
          }

          return reply.send({ found: false, carrier: null });
        }
      }
    },
  );
}
