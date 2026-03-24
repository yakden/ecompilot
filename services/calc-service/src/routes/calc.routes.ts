// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — calc-service
// All /api/v1/calc/* route handlers with Zod validation
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { Decimal } from "decimal.js";

import { calculateMargin } from "../services/margin.calculator.js";
import { calculateZus, ZUS_RATES_2025 } from "../services/zus.calculator.js";
import {
  calculateAllegroFees,
  getAllegroCategories,
  ALLEGRO_CATEGORY_COMMISSIONS,
} from "../services/allegro-fees.calculator.js";
import { calculateDelivery } from "../services/delivery.calculator.js";
import { getDb } from "../db/connection.js";
import { calculationHistory } from "../db/schema.js";
import type { CalculationType } from "../db/schema.js";
import { geocodeAddress, reverseGeocode } from "../services/geocoding.service.js";
import { validatePostalCode } from "../services/geonames.service.js";
import {
  preloadCountries,
  getCountryByCode,
  fetchCountryByCode,
  listCountries,
} from "../services/countries.service.js";
import { env } from "../config/env.js";
import { requireAuth } from "@ecompilot/shared-auth";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function positiveNum(field: string): z.ZodNumber {
  return z.number({ required_error: `${field} is required` }).positive(`${field} must be positive`);
}

function nonNegativeNum(field: string): z.ZodNumber {
  return z.number({ required_error: `${field} is required` }).nonnegative(`${field} must be ≥ 0`);
}

function percentageField(field: string): z.ZodNumber {
  return z
    .number({ required_error: `${field} is required` })
    .min(0, `${field} must be ≥ 0`)
    .max(100, `${field} must be ≤ 100`);
}

/** Persist a calculation to the DB — fire-and-forget; never throws to caller */
async function persistHistory(
  userId: string | undefined,
  type: CalculationType,
  input: unknown,
  result: unknown,
): Promise<void> {
  if (userId == null) return;
  try {
    const db = getDb();
    await db.insert(calculationHistory).values({
      userId,
      type,
      input: input as Record<string, unknown>,
      result: result as Record<string, unknown>,
    });
  } catch {
    // Non-critical — do not surface storage errors to caller
  }
}

/** Extract userId from verified JWT (set by shared-auth middleware) */
function extractUserId(request: FastifyRequest): string | undefined {
  return request.authUser?.sub ?? undefined;
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const MarginSchema = z.object({
  purchasePricePln: positiveNum("purchasePricePln"),
  shippingFromChina: nonNegativeNum("shippingFromChina"),
  customsDutyPct: percentageField("customsDutyPct"),
  vatRatePct: percentageField("vatRatePct").optional(),
  allegroCommissionPct: z
    .number()
    .min(0)
    .max(15, "allegroCommissionPct must be 0–15"),
  allegroAdsCost: nonNegativeNum("allegroAdsCost"),
  returnRatePct: percentageField("returnRatePct"),
  sellingPricePln: positiveNum("sellingPricePln"),
  quantity: z.number().int().positive("quantity must be a positive integer"),
});

const ZusSchema = z.object({
  monthlyIncome: nonNegativeNum("monthlyIncome"),
  zusType: z.enum(["preferential", "reduced", "full"]),
  includeChorobowe: z.boolean(),
});

const AllegroFeesSchema = z.object({
  category: z.enum([
    "Electronics",
    "Fashion",
    "Home & Garden",
    "Sports",
    "Auto",
    "Books",
    "Beauty",
    "Kids",
    "Food & Health",
    "Toys",
    "Tools & DIY",
    "Collectibles",
    "Musical Instruments",
    "Pet Supplies",
    "Other",
  ]),
  sellingPricePln: positiveNum("sellingPricePln"),
  isSmartSeller: z.boolean(),
});

const DeliverySchema = z.object({
  weightKg: positiveNum("weightKg"),
  volumeM3: nonNegativeNum("volumeM3"),
  method: z.enum(["sea", "train", "air"]),
  isWhiteImport: z.boolean(),
  usdPlnRate: z.number().positive("usdPlnRate must be positive").optional(),
});

const BreakevenSchema = z.object({
  fixedCostsPln: nonNegativeNum("fixedCostsPln"),
  variableCostPerUnitPln: nonNegativeNum("variableCostPerUnitPln"),
  sellingPricePln: positiveNum("sellingPricePln"),
  targetProfitPln: nonNegativeNum("targetProfitPln").optional(),
});

const RoiSchema = z.object({
  batches: z
    .array(
      z.object({
        name: z.string().min(1),
        purchasePricePln: positiveNum("purchasePricePln"),
        shippingFromChina: nonNegativeNum("shippingFromChina"),
        customsDutyPct: percentageField("customsDutyPct"),
        vatRatePct: percentageField("vatRatePct").optional(),
        allegroCommissionPct: z.number().min(0).max(15),
        allegroAdsCost: nonNegativeNum("allegroAdsCost"),
        returnRatePct: percentageField("returnRatePct"),
        sellingPricePln: positiveNum("sellingPricePln"),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, "batches must contain at least one item")
    .max(50, "batches may not exceed 50 items"),
});

const HistoryQuerySchema = z.object({
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(100))
    .optional()
    .default("20"),
  offset: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(0))
    .optional()
    .default("0"),
  type: z
    .enum(["margin", "zus", "allegro-fees", "delivery", "breakeven", "roi"])
    .optional(),
});

// ─── Validation wrapper ───────────────────────────────────────────────────────

function parseBody<T>(schema: z.ZodType<T>, body: unknown, reply: FastifyReply): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    void reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      issues: result.error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
    return null;
  }
  return result.data;
}

// ─── Geo query schemas ────────────────────────────────────────────────────────

const GeocodeQuerySchema = z.object({
  address: z
    .string({ required_error: "address query param is required" })
    .min(3, "address must be at least 3 characters")
    .max(500),
});

const ReverseGeocodeQuerySchema = z.object({
  lat: z
    .string({ required_error: "lat query param is required" })
    .regex(/^-?\d+(\.\d+)?$/, "lat must be a decimal number")
    .transform(Number)
    .pipe(z.number().min(-90).max(90)),
  lng: z
    .string({ required_error: "lng query param is required" })
    .regex(/^-?\d+(\.\d+)?$/, "lng must be a decimal number")
    .transform(Number)
    .pipe(z.number().min(-180).max(180)),
});

const PostalCodeParamSchema = z.object({
  code: z
    .string()
    .min(5, "postal code must be at least 5 characters")
    .max(6, "postal code must be at most 6 characters")
    .regex(/^\d{2}-?\d{3}$/, "postal code must be in NN-NNN or NNNNN format"),
});

const CountryCodeParamSchema = z.object({
  code: z
    .string()
    .length(2, "country code must be ISO 3166-1 alpha-2 (2 characters)")
    .regex(/^[A-Za-z]{2}$/, "country code must contain only letters"),
});

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function calcRoutes(app: FastifyInstance): Promise<void> {
  // Preload all countries into memory on startup — non-blocking
  preloadCountries().catch((err: unknown) => {
    app.log.warn({ err }, "REST Countries preload failed at startup — will retry on demand");
  });
  // ── POST /api/v1/calc/margin ───────────────────────────────────────────────
  app.post(
    "/api/v1/calc/margin",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = parseBody(MarginSchema, request.body, reply);
      if (body === null) return;

      const result = calculateMargin(body);
      await persistHistory(extractUserId(request), "margin", body, result);

      return reply.status(200).send({ data: result });
    },
  );

  // ── POST /api/v1/calc/delivery-china ──────────────────────────────────────
  app.post(
    "/api/v1/calc/delivery-china",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = parseBody(DeliverySchema, request.body, reply);
      if (body === null) return;

      const result = calculateDelivery(body);
      await persistHistory(extractUserId(request), "delivery", body, result);

      return reply.status(200).send({ data: result });
    },
  );

  // ── POST /api/v1/calc/zus ─────────────────────────────────────────────────
  app.post(
    "/api/v1/calc/zus",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = parseBody(ZusSchema, request.body, reply);
      if (body === null) return;

      const result = calculateZus(body);
      await persistHistory(extractUserId(request), "zus", body, result);

      return reply.status(200).send({ data: result });
    },
  );

  // ── POST /api/v1/calc/allegro-fees ────────────────────────────────────────
  app.post(
    "/api/v1/calc/allegro-fees",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = parseBody(AllegroFeesSchema, request.body, reply);
      if (body === null) return;

      const result = calculateAllegroFees(body);
      await persistHistory(extractUserId(request), "allegro-fees", body, result);

      return reply.status(200).send({ data: result });
    },
  );

  // ── POST /api/v1/calc/breakeven ───────────────────────────────────────────
  app.post(
    "/api/v1/calc/breakeven",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = parseBody(BreakevenSchema, request.body, reply);
      if (body === null) return;

      const fixed = new Decimal(body.fixedCostsPln);
      const variable = new Decimal(body.variableCostPerUnitPln);
      const price = new Decimal(body.sellingPricePln);
      const targetProfit = new Decimal(body.targetProfitPln ?? 0);

      const contributionMargin = price.minus(variable);

      let breakevenUnits: string;
      let breakevenRevenue: string;
      let unitsForTarget: string;

      if (contributionMargin.lte(0)) {
        breakevenUnits = "∞";
        breakevenRevenue = "∞";
        unitsForTarget = "∞";
      } else {
        const beu = fixed.div(contributionMargin).ceil();
        breakevenUnits = beu.toFixed(0);
        breakevenRevenue = beu.mul(price).toFixed(2);
        const uft = fixed.plus(targetProfit).div(contributionMargin).ceil();
        unitsForTarget = uft.toFixed(0);
      }

      const result = {
        breakevenUnits,
        breakevenRevenue,
        unitsForTarget,
        contributionMarginPerUnit: contributionMargin.toFixed(2),
        contributionMarginPct: price.isZero()
          ? "0.00"
          : contributionMargin.div(price).mul(100).toFixed(2),
      };

      await persistHistory(extractUserId(request), "breakeven", body, result);
      return reply.status(200).send({ data: result });
    },
  );

  // ── POST /api/v1/calc/roi ─────────────────────────────────────────────────
  app.post(
    "/api/v1/calc/roi",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = parseBody(RoiSchema, request.body, reply);
      if (body === null) return;

      const batchResults = body.batches.map((batch) => {
        const margin = calculateMargin(batch);
        const quantity = new Decimal(batch.quantity);
        const netProfitPerUnit = new Decimal(margin.netProfit);
        const totalCostPerUnit = new Decimal(margin.totalCostPerUnit);

        const totalInvestment = totalCostPerUnit.mul(quantity);
        const totalProfit = netProfitPerUnit.mul(quantity);
        const totalRevenue = new Decimal(batch.sellingPricePln).mul(quantity);

        return {
          name: batch.name,
          quantity: batch.quantity,
          marginPct: margin.marginPct,
          roi: margin.roi,
          recommendation: margin.recommendation,
          totalInvestment: totalInvestment.toFixed(2),
          totalProfit: totalProfit.toFixed(2),
          totalRevenue: totalRevenue.toFixed(2),
          perUnit: {
            netProfit: margin.netProfit,
            totalCost: margin.totalCostPerUnit,
          },
        };
      });

      // Portfolio aggregate
      const totalInvestment = batchResults.reduce(
        (acc, b) => acc.plus(new Decimal(b.totalInvestment)),
        new Decimal(0),
      );
      const totalProfit = batchResults.reduce(
        (acc, b) => acc.plus(new Decimal(b.totalProfit)),
        new Decimal(0),
      );
      const portfolioRoi = totalInvestment.isZero()
        ? new Decimal(0)
        : totalProfit.div(totalInvestment).mul(100);

      const result = {
        batches: batchResults,
        portfolio: {
          totalInvestment: totalInvestment.toFixed(2),
          totalProfit: totalProfit.toFixed(2),
          portfolioRoi: portfolioRoi.toFixed(2),
        },
      };

      await persistHistory(extractUserId(request), "roi", body, result);
      return reply.status(200).send({ data: result });
    },
  );

  // ── GET /api/v1/calc/rates ────────────────────────────────────────────────
  app.get(
    "/api/v1/calc/rates",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const r = ZUS_RATES_2025;

      const rates = {
        zus2025: {
          preferential: {
            socialFlat: r.preferential.socialFlat.toFixed(2),
            description: "First 6 months of business activity",
          },
          reduced: {
            socialFlat: r.reduced.socialFlat.toFixed(2),
            description: "Months 7–30 (Mały ZUS Plus)",
          },
          full: {
            emerytalne: r.full.emerytalne.toFixed(2),
            rentowe: r.full.rentowe.toFixed(2),
            chorobowe: r.full.chorobowe.toFixed(2),
            wypadkowe: r.full.wypadkowe.toFixed(2),
            fp: r.full.fp.toFixed(2),
            assessmentBase: r.full.assessmentBase.toFixed(2),
            description: "Full ZUS contributions",
          },
          health: {
            ratePct: r.health.ratePct.toFixed(2),
            minimumPln: r.health.minimumPln.toFixed(2),
            description: "Health contribution (zdrowotna)",
          },
        },
        vat: {
          standard: "23.00",
          reduced8: "8.00",
          reduced5: "5.00",
          zero: "0.00",
        },
        allegroCommissions: getAllegroCategories(),
        shipping: {
          sea: { minUsdPerKg: "2.00", maxUsdPerKg: "4.00", days: "40–60" },
          train: { minUsdPerKg: "4.00", maxUsdPerKg: "7.00", days: "20–30" },
          air: { minUsdPerKg: "8.00", maxUsdPerKg: "15.00", days: "7–14" },
        },
        lastUpdated: "2025-01-01",
      };

      return reply.status(200).send({ data: rates });
    },
  );

  // ── GET /api/v1/calc/history ──────────────────────────────────────────────
  // Pro+ only — requireAuth ensures JWT verification via shared-auth
  app.get(
    "/api/v1/calc/history",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;

      const plan = request.authUser!.plan;
      if (plan !== "pro" && plan !== "business") {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "Calculation history requires a Pro or Business plan",
        });
      }

      const queryResult = HistoryQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Validation Error",
          issues: queryResult.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
      }

      const { limit, offset, type } = queryResult.data;

      try {
        const db = getDb();
        const { eq, and, desc } = await import("drizzle-orm");
        const { calculationHistory: histTable } = await import(
          "../db/schema.js"
        );

        const whereClause =
          type != null
            ? and(eq(histTable.userId, userId), eq(histTable.type, type))
            : eq(histTable.userId, userId);

        const rows = await db
          .select()
          .from(histTable)
          .where(whereClause)
          .orderBy(desc(histTable.createdAt))
          .limit(limit)
          .offset(offset);

        return reply.status(200).send({
          data: rows,
          pagination: { limit, offset, count: rows.length },
        });
      } catch (err: unknown) {
        request.log.error({ err }, "Failed to fetch calculation history");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to retrieve history",
        });
      }
    },
  );

  // ── GET /api/v1/calc/geocode ───────────────────────────────────────────────
  // Nominatim forward geocoding — Poland only, up to 5 results
  app.get(
    "/api/v1/calc/geocode",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const queryResult = GeocodeQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Validation Error",
          issues: queryResult.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
      }

      try {
        const response = await geocodeAddress(queryResult.data.address, env.REDIS_URL);
        return reply.status(200).send(response);
      } catch (err: unknown) {
        request.log.error({ err }, "Geocoding error");
        return reply.status(502).send({
          statusCode: 502,
          error: "Bad Gateway",
          message: "Geocoding service unavailable",
        });
      }
    },
  );

  // ── GET /api/v1/calc/reverse-geocode ──────────────────────────────────────
  // Nominatim reverse geocoding — coordinates to address
  app.get(
    "/api/v1/calc/reverse-geocode",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const queryResult = ReverseGeocodeQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Validation Error",
          issues: queryResult.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
      }

      try {
        const result = await reverseGeocode(
          queryResult.data.lat,
          queryResult.data.lng,
          env.REDIS_URL,
        );
        return reply.status(200).send({ result });
      } catch (err: unknown) {
        request.log.error({ err }, "Reverse geocoding error");
        return reply.status(502).send({
          statusCode: 502,
          error: "Bad Gateway",
          message: "Reverse geocoding service unavailable",
        });
      }
    },
  );

  // ── GET /api/v1/calc/validate-postal/:code ────────────────────────────────
  // GeoNames postal code validation for Poland
  app.get(
    "/api/v1/calc/validate-postal/:code",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramResult = PostalCodeParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Validation Error",
          issues: paramResult.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
      }

      try {
        const result = await validatePostalCode(
          paramResult.data.code,
          env.GEONAMES_USERNAME,
          env.REDIS_URL,
        );
        return reply.status(200).send(result);
      } catch (err: unknown) {
        request.log.error({ err }, "Postal code validation error");
        return reply.status(502).send({
          statusCode: 502,
          error: "Bad Gateway",
          message: "Postal code validation service unavailable",
        });
      }
    },
  );

  // ── GET /api/v1/calc/country/:code ────────────────────────────────────────
  // REST Countries — single country detail
  app.get(
    "/api/v1/calc/country/:code",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramResult = CountryCodeParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Validation Error",
          issues: paramResult.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
      }

      try {
        // Try memory cache first, then live fetch
        const inMemory = getCountryByCode(paramResult.data.code);
        const country = inMemory ?? await fetchCountryByCode(paramResult.data.code);

        if (country === null) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: `Country "${paramResult.data.code.toUpperCase()}" not found`,
          });
        }

        return reply.status(200).send({ data: country });
      } catch (err: unknown) {
        request.log.error({ err }, "Country lookup error");
        return reply.status(502).send({
          statusCode: 502,
          error: "Bad Gateway",
          message: "Country data service unavailable",
        });
      }
    },
  );

  // ── GET /api/v1/calc/countries ────────────────────────────────────────────
  // REST Countries — list all countries (from memory)
  app.get(
    "/api/v1/calc/countries",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Trigger preload if not yet complete (e.g., startup failed)
        await preloadCountries();
        const countries = listCountries();
        return reply.status(200).send({ countries });
      } catch (err: unknown) {
        request.log.error({ err }, "Countries list error");
        return reply.status(502).send({
          statusCode: 502,
          error: "Bad Gateway",
          message: "Country data service unavailable",
        });
      }
    },
  );
}
