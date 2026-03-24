// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — suppliers-service routes
//
// GET  /api/v1/suppliers              — ES search with filters (Pro+)
// GET  /api/v1/suppliers/search       — free-text ES search (Pro+)
// GET  /api/v1/suppliers/categories   — all unique categories (Pro+)
// GET  /api/v1/suppliers/featured     — featured/partner suppliers (Pro+)
// GET  /api/v1/suppliers/:id          — full supplier details (Pro+)
// POST /api/v1/suppliers/:id/reviews  — add review (Pro+)
// POST /api/v1/suppliers/suggest      — suggest a new supplier (Pro+)
// POST /api/v1/suppliers/:id/click    — record partner click (Pro+)
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  suppliers,
  supplierReviews,
} from "../db/schema.js";
import type { SupplierType } from "../db/schema.js";
import { eq, sql, desc, avg } from "drizzle-orm";
import {
  searchSuppliers,
  indexSupplier,
} from "../services/elasticsearch.service.js";
import { trackClick } from "../services/partner.service.js";
import {
  requireSuppliersAccess,
} from "../middleware/auth.middleware.js";
import { lookupKrs, KrsNumberSchema } from "../services/krs.service.js";
import {
  lookupCeidgByNip,
  NipSchema,
  CeidgUnauthorizedError,
  CeidgServiceUnavailableError,
} from "../services/ceidg.service.js";
import {
  lookupRegon,
  RegonSchema,
} from "../services/regon.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Zod validation schemas
// ─────────────────────────────────────────────────────────────────────────────

const SupplierTypeSchema = z.enum(["china", "poland", "turkey", "eu", "dropship"]);

const ListQuerySchema = z.object({
  type: SupplierTypeSchema.optional(),
  category: z.string().min(1).optional(),
  dropship: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  country: z.string().length(2).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const SearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  type: SupplierTypeSchema.optional(),
  category: z.string().min(1).optional(),
  dropship: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const IdParamSchema = z.object({
  id: z.string().uuid("Invalid supplier ID"),
});

const AddReviewBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  language: z.enum(["ru", "pl", "ua", "en"]).optional(),
  pros: z.array(z.string().max(200)).max(10).optional(),
  cons: z.array(z.string().max(200)).max(10).optional(),
});

const SuggestSupplierBodySchema = z.object({
  name: z.string().min(1).max(200),
  website: z.string().url().optional(),
  type: SupplierTypeSchema,
  country: z.string().length(2).optional(),
  categories: z.array(z.string()).max(20).optional(),
  notes: z.string().max(1000).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper — safe query param parsing
// ─────────────────────────────────────────────────────────────────────────────

interface FastifyReplyLike {
  code(statusCode: number): { send(payload: unknown): void };
}

function parseQuery<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  query: unknown,
  reply: FastifyReplyLike,
): z.infer<TSchema> | null {
  const result = schema.safeParse(query);
  if (!result.success) {
    void reply.code(400).send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid query parameters",
        details: result.error.flatten(),
        timestamp: new Date().toISOString(),
      },
    });
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return result.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Supplier serializer — strips internal fields from DB row
// ─────────────────────────────────────────────────────────────────────────────

function serializeSupplier(s: typeof suppliers.$inferSelect) {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    type: s.type,
    country: s.country,
    website: s.website,
    logoUrl: s.logoUrl,
    description: s.description,
    minimumOrderEur: s.minimumOrderEur,
    categories: s.categories,
    platforms: s.platforms,
    supportsDropship: s.supportsDropship,
    hasBaselinkerId: s.hasBaselinkerId,
    isVerified: s.isVerified,
    rating: s.rating,
    reviewCount: s.reviewCount,
    languages: s.languages,
    contacts: s.contacts,
    shippingInfo: s.shippingInfo,
    partnerCommissionPct: s.partnerCommissionPct,
    tags: s.tags,
    isActive: s.isActive,
    isFeatured: s.isFeatured,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

const suppliersRoutes: FastifyPluginAsync = async (fastify) => {
  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/suppliers
  // ───────────────────────────────────────────────────────────────────────────
  fastify.get("/api/v1/suppliers", async (request, reply) => {
    try {
      requireSuppliersAccess(request, reply);
    } catch {
      return;
    }

    const query = parseQuery(ListQuerySchema, request.query, reply);
    if (query === null) return;

    const result = await searchSuppliers({
      filters: {
        type: query.type as SupplierType | undefined,
        category: query.category,
        dropship: query.dropship,
        minRating: query.minRating,
        country: query.country,
      },
      page: query.page,
      limit: query.limit,
    });

    return reply.send({
      success: true,
      data: result.hits,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        hasMore: result.hasMore,
      },
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/suppliers/search?q=
  // Must be before /:id to avoid slug conflict
  // ───────────────────────────────────────────────────────────────────────────
  fastify.get("/api/v1/suppliers/search", async (request, reply) => {
    try {
      requireSuppliersAccess(request, reply);
    } catch {
      return;
    }

    const query = parseQuery(SearchQuerySchema, request.query, reply);
    if (query === null) return;

    const result = await searchSuppliers({
      query: query.q,
      filters: {
        type: query.type as SupplierType | undefined,
        category: query.category,
        dropship: query.dropship,
        minRating: query.minRating,
      },
      page: query.page,
      limit: query.limit,
    });

    return reply.send({
      success: true,
      data: result.hits,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        hasMore: result.hasMore,
      },
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/suppliers/categories
  // ───────────────────────────────────────────────────────────────────────────
  fastify.get("/api/v1/suppliers/categories", async (request, reply) => {
    try {
      requireSuppliersAccess(request, reply);
    } catch {
      return;
    }

    const rows = await db
      .select({ categories: suppliers.categories })
      .from(suppliers)
      .where(eq(suppliers.isActive, true));

    const categorySet = new Set<string>();
    for (const row of rows) {
      for (const cat of row.categories ?? []) {
        categorySet.add(cat);
      }
    }

    const categories = Array.from(categorySet).sort();

    return reply.send({
      success: true,
      data: categories,
      meta: { total: categories.length },
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/suppliers/featured
  // ───────────────────────────────────────────────────────────────────────────
  fastify.get("/api/v1/suppliers/featured", async (request, reply) => {
    try {
      requireSuppliersAccess(request, reply);
    } catch {
      return;
    }

    const result = await searchSuppliers({
      filters: { isFeatured: true },
      limit: 20,
    });

    return reply.send({
      success: true,
      data: result.hits,
      meta: { total: result.total },
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/suppliers/:id
  // ───────────────────────────────────────────────────────────────────────────
  fastify.get("/api/v1/suppliers/:id", async (request, reply) => {
    try {
      requireSuppliersAccess(request, reply);
    } catch {
      return;
    }

    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid supplier ID",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, params.data.id))
      .limit(1);

    if (supplier === undefined || !supplier.isActive) {
      return reply.code(404).send({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Supplier not found",
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Fetch latest 5 reviews
    const reviews = await db
      .select()
      .from(supplierReviews)
      .where(eq(supplierReviews.supplierId, supplier.id))
      .orderBy(desc(supplierReviews.createdAt))
      .limit(5);

    return reply.send({
      success: true,
      data: {
        ...serializeSupplier(supplier),
        recentReviews: reviews,
      },
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // POST /api/v1/suppliers/:id/reviews
  // ───────────────────────────────────────────────────────────────────────────
  fastify.post("/api/v1/suppliers/:id/reviews", async (request, reply) => {
    try {
      requireSuppliersAccess(request, reply);
    } catch {
      return;
    }

    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid supplier ID",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const body = AddReviewBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid review data",
          details: body.error.flatten(),
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Verify supplier exists
    const [supplier] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.id, params.data.id))
      .limit(1);

    if (supplier === undefined) {
      return reply.code(404).send({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Supplier not found",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const userId = request.user!.sub;

    const [review] = await db
      .insert(supplierReviews)
      .values({
        supplierId: params.data.id,
        userId,
        rating: body.data.rating,
        comment: body.data.comment ?? null,
        language: body.data.language ?? null,
        pros: body.data.pros ?? [],
        cons: body.data.cons ?? [],
      })
      .returning();

    // Recalculate and update supplier average rating
    const [ratingResult] = await db
      .select({
        avgRating: avg(supplierReviews.rating),
        count: sql<number>`COUNT(*)::int`,
      })
      .from(supplierReviews)
      .where(eq(supplierReviews.supplierId, params.data.id));

    if (ratingResult !== undefined) {
      await db
        .update(suppliers)
        .set({
          rating: ratingResult.avgRating ?? "0",
          reviewCount: ratingResult.count,
          updatedAt: new Date(),
        })
        .where(eq(suppliers.id, params.data.id));

      // Sync updated supplier to Elasticsearch
      const [updatedSupplier] = await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, params.data.id))
        .limit(1);

      if (updatedSupplier !== undefined) {
        await indexSupplier(updatedSupplier);
      }
    }

    return reply.code(201).send({
      success: true,
      data: review,
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // POST /api/v1/suppliers/suggest
  // ───────────────────────────────────────────────────────────────────────────
  fastify.post("/api/v1/suppliers/suggest", async (request, reply) => {
    try {
      requireSuppliersAccess(request, reply);
    } catch {
      return;
    }

    const body = SuggestSupplierBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid suggestion data",
          details: body.error.flatten(),
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Suggestions are stored as inactive suppliers pending admin review
    const slug = body.data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .concat("-", crypto.randomUUID().slice(0, 8));

    const [suggested] = await db
      .insert(suppliers)
      .values({
        name: body.data.name,
        slug,
        type: body.data.type,
        country: body.data.country ?? null,
        website: body.data.website ?? null,
        categories: body.data.categories ?? [],
        isActive: false,
        isVerified: false,
        isFeatured: false,
        description: body.data.notes
          ? { en: `Suggested supplier. Notes: ${body.data.notes}` }
          : null,
      })
      .returning({ id: suppliers.id, name: suppliers.name, slug: suppliers.slug });

    return reply.code(202).send({
      success: true,
      data: {
        id: suggested?.id,
        message:
          "Thank you for your suggestion. Our team will review it and add the supplier within 2-3 business days.",
      },
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/suppliers/verify-krs/:krsNumber — KRS registry lookup
  // ───────────────────────────────────────────────────────────────────────────
  fastify.get("/api/v1/suppliers/verify-krs/:krsNumber", async (request, reply) => {
    try {
      requireSuppliersAccess(request, reply);
    } catch {
      return;
    }

    const parseResult = KrsNumberSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid KRS number — must be exactly 10 digits",
          details: parseResult.error.flatten(),
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { krsNumber } = parseResult.data;

    try {
      const result = await lookupKrs({ krsNumber });

      if (!result.found || result.company === undefined) {
        return reply.code(200).send({
          success: true,
          data: { found: false },
        });
      }

      const { company } = result;

      return reply.code(200).send({
        success: true,
        data: {
          found: true,
          company: {
            name: company.name,
            nip: company.nip,
            regon: company.regon,
            address: company.address,
            capital: company.capital,
            boardMembers: company.boardMembers,
            registrationDate: company.registrationDate,
          },
        },
      });
    } catch (err) {
      if (
        err instanceof Error &&
        err.name === "KrsServiceUnavailableError"
      ) {
        return reply.code(503).send({
          success: false,
          error: {
            code: "KRS_SERVICE_UNAVAILABLE",
            message:
              "KRS API is currently unavailable. Please try again later.",
            timestamp: new Date().toISOString(),
          },
        });
      }

      return reply.code(500).send({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred during KRS lookup",
          timestamp: new Date().toISOString(),
        },
      });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/suppliers/verify-nip/:nip — CEIDG business lookup by NIP
  // ───────────────────────────────────────────────────────────────────────────
  fastify.get("/api/v1/suppliers/verify-nip/:nip", async (request, reply) => {
    try {
      requireSuppliersAccess(request, reply);
    } catch {
      return;
    }

    const parseResult = NipSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid NIP — must be exactly 10 digits",
          details: parseResult.error.flatten(),
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { nip } = parseResult.data;

    try {
      const result = await lookupCeidgByNip({ nip });

      if (!result.found || result.business === undefined) {
        return reply.code(200).send({
          success: true,
          data: { found: false },
        });
      }

      const { business } = result;

      return reply.code(200).send({
        success: true,
        data: {
          found: true,
          business: {
            name: business.name,
            nip: business.nip,
            regon: business.regon,
            address: business.address,
            pkdCodes: business.pkdCodes,
            status: business.status,
            startDate: business.startDate,
          },
        },
      });
    } catch (err) {
      if (err instanceof CeidgUnauthorizedError) {
        return reply.code(503).send({
          success: false,
          error: {
            code: "CEIDG_NOT_CONFIGURED",
            message:
              "CEIDG integration is not yet configured. Please contact support.",
            timestamp: new Date().toISOString(),
          },
        });
      }

      if (err instanceof CeidgServiceUnavailableError) {
        return reply.code(503).send({
          success: false,
          error: {
            code: "CEIDG_SERVICE_UNAVAILABLE",
            message:
              "CEIDG API is currently unavailable. Please try again later.",
            timestamp: new Date().toISOString(),
          },
        });
      }

      return reply.code(500).send({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred during NIP lookup",
          timestamp: new Date().toISOString(),
        },
      });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/suppliers/verify-regon/:regon — REGON cross-reference lookup
  // ───────────────────────────────────────────────────────────────────────────
  fastify.get("/api/v1/suppliers/verify-regon/:regon", async (request, reply) => {
    try {
      requireSuppliersAccess(request, reply);
    } catch {
      return;
    }

    const parseResult = RegonSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid REGON — must be 9 or 14 digits",
          details: parseResult.error.flatten(),
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { regon } = parseResult.data;

    try {
      const result = await lookupRegon({ regon });

      if (!result.found || result.entity === undefined) {
        return reply.code(200).send({
          success: true,
          data: {
            found: false,
            ...(result.birIntegrationPending === true
              ? { note: "Full REGON lookup requires BIR integration (coming soon)." }
              : {}),
          },
        });
      }

      const { entity } = result;

      return reply.code(200).send({
        success: true,
        data: {
          found: true,
          entity: {
            name: entity.name,
            nip: entity.nip,
            regon: entity.regon,
            address: entity.address,
            type: entity.type,
          },
        },
      });
    } catch (err) {
      return reply.code(500).send({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred during REGON lookup",
          timestamp: new Date().toISOString(),
        },
      });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // POST /api/v1/suppliers/:id/click — record partner click + set cookie
  // ───────────────────────────────────────────────────────────────────────────
  fastify.post("/api/v1/suppliers/:id/click", async (request, reply) => {
    try {
      requireSuppliersAccess(request, reply);
    } catch {
      return;
    }

    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid supplier ID",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const [supplier] = await db
      .select({ id: suppliers.id, website: suppliers.website })
      .from(suppliers)
      .where(eq(suppliers.id, params.data.id))
      .limit(1);

    if (supplier === undefined) {
      return reply.code(404).send({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Supplier not found",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const userId = request.user?.sub ?? null;
    const ipAddress =
      typeof request.ip === "string" ? request.ip : null;

    const click = await trackClick({
      supplierId: supplier.id,
      userId,
      utmSource: "ecompilot",
      ipAddress,
      request,
      reply,
    });

    return reply.send({
      success: true,
      data: {
        clickId: click.clickId,
        redirectUrl: supplier.website ?? null,
      },
    });
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default fp(suppliersRoutes as any, {
  name: "suppliers-routes",
  fastify: "5.x",
});
