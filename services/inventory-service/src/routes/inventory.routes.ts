// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — inventory-service
// All /api/v1/inventory/* route handlers with Zod validation
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { getDb } from "../db/client.js";
import {
  products,
  inventorySnapshots,
  reorderAlerts,
} from "../db/schema.js";

import { requireAuth } from "@ecompilot/shared-auth";
import { runAbcAnalysis } from "../services/abc-analysis.service.js";
import { forecastProduct } from "../services/forecasting.service.js";
import { analyzeDeadStock } from "../services/deadstock.service.js";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function extractUserId(request: FastifyRequest): string | undefined {
  return request.authUser?.sub ?? undefined;
}

function requireUserId(
  request: FastifyRequest,
  reply: FastifyReply,
): string | null {
  const userId = extractUserId(request);
  if (userId === undefined) {
    void reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Authentication required",
    });
    return null;
  }
  return userId;
}

function parseBody<T>(
  schema: z.ZodType<T>,
  body: unknown,
  reply: FastifyReply,
): T | null {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseQuery<TSchema extends z.ZodType<any, any, any>>(
  schema: TSchema,
  query: unknown,
  reply: FastifyReply,
): z.output<TSchema> | null {
  const result = schema.safeParse(query);
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
  return result.data as z.output<TSchema>;
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const coerceInt = (defaultVal: string) =>
  z
    .string()
    .optional()
    .default(defaultVal)
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int());

const ProductsQuerySchema = z.object({
  limit: coerceInt("20").pipe(z.number().min(1).max(100)),
  offset: coerceInt("0").pipe(z.number().min(0)),
  sortBy: z
    .enum(["revenue", "stock", "lastSold", "name", "created"])
    .optional()
    .default("revenue"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
  category: z.string().optional(),
  abcClass: z.enum(["A", "B", "C"]).optional(),
});

const CreateProductSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  category: z.string().min(1).max(100),
  purchasePrice: z.number().int().positive(),
  sellingPrice: z.number().int().positive(),
  currentStock: z.number().int().nonnegative().optional().default(0),
  reservedStock: z.number().int().nonnegative().optional().default(0),
  reorderPoint: z.number().int().nonnegative().optional().default(10),
  leadTimeDays: z.number().int().positive().optional().default(30),
});

const UpdateProductSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  category: z.string().min(1).max(100).optional(),
  purchasePrice: z.number().int().positive().optional(),
  sellingPrice: z.number().int().positive().optional(),
  currentStock: z.number().int().nonnegative().optional(),
  reservedStock: z.number().int().nonnegative().optional(),
  reorderPoint: z.number().int().nonnegative().optional(),
  leadTimeDays: z.number().int().positive().optional(),
});

const ForecastBodySchema = z.object({
  productId: z.string().uuid(),
});

const IdParamSchema = z.object({
  id: z.string().uuid(),
});

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  // All inventory routes require authentication
  app.addHook("preHandler", requireAuth);

  // ── GET /api/v1/inventory/products ──────────────────────────────────────
  app.get(
    "/api/v1/inventory/products",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = requireUserId(request, reply);
      if (userId === null) return;

      const query = parseQuery(ProductsQuerySchema, request.query, reply);
      if (query === null) return;

      const db = getDb();

      const orderCol = (() => {
        switch (query.sortBy) {
          case "revenue":
            return products.totalRevenue;
          case "stock":
            return products.currentStock;
          case "lastSold":
            return products.lastSoldAt;
          case "name":
            return products.name;
          case "created":
            return products.createdAt;
          default:
            return products.totalRevenue;
        }
      })();

      const orderFn = query.sortDir === "asc" ? asc : desc;

      const conditions = [eq(products.userId, userId)];

      if (query.category !== undefined) {
        conditions.push(eq(products.category, query.category));
      }

      if (query.abcClass !== undefined) {
        conditions.push(eq(products.abcClass, query.abcClass));
      }

      const whereClause =
        conditions.length === 1
          ? conditions[0]!
          : and(...(conditions as [typeof conditions[0], ...typeof conditions]));

      const rows = await db
        .select()
        .from(products)
        .where(whereClause)
        .orderBy(orderFn(orderCol))
        .limit(query.limit)
        .offset(query.offset);

      // Total count for pagination
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(whereClause);

      const total = countResult[0]?.count ?? 0;

      return reply.status(200).send({
        data: rows,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total,
          hasMore: query.offset + query.limit < total,
        },
      });
    },
  );

  // ── GET /api/v1/inventory/products/:id ──────────────────────────────────
  app.get(
    "/api/v1/inventory/products/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = requireUserId(request, reply);
      if (userId === null) return;

      const params = parseQuery(IdParamSchema, request.params, reply);
      if (params === null) return;

      const db = getDb();

      const productRows = await db
        .select()
        .from(products)
        .where(
          and(eq(products.id, params.id), eq(products.userId, userId)),
        );

      const product = productRows[0];
      if (product === undefined) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Product not found",
        });
      }

      // Fetch last 30 days of snapshots
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0]
        ?? thirtyDaysAgo.toISOString().substring(0, 10);

      const snapshots = await db
        .select()
        .from(inventorySnapshots)
        .where(eq(inventorySnapshots.productId, params.id))
        .orderBy(desc(inventorySnapshots.date))
        .limit(30);

      return reply.status(200).send({ data: { product, snapshots } });
    },
  );

  // ── POST /api/v1/inventory/products ─────────────────────────────────────
  app.post(
    "/api/v1/inventory/products",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = requireUserId(request, reply);
      if (userId === null) return;

      const body = parseBody(CreateProductSchema, request.body, reply);
      if (body === null) return;

      const db = getDb();

      // Check for duplicate SKU
      const existing = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.userId, userId), eq(products.sku, body.sku)));

      if (existing.length > 0) {
        return reply.status(409).send({
          statusCode: 409,
          error: "Conflict",
          message: `SKU '${body.sku}' already exists for this account`,
        });
      }

      const inserted = await db
        .insert(products)
        .values({
          userId,
          sku: body.sku,
          name: body.name,
          category: body.category,
          purchasePrice: body.purchasePrice,
          sellingPrice: body.sellingPrice,
          // Zod .default() produces T|undefined under exactOptionalPropertyTypes;
          // coerce to concrete values here.
          currentStock: body.currentStock ?? 0,
          reservedStock: body.reservedStock ?? 0,
          reorderPoint: body.reorderPoint ?? 10,
          leadTimeDays: body.leadTimeDays ?? 30,
        })
        .returning();

      const newProduct = inserted[0];
      if (newProduct === undefined) {
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to create product",
        });
      }

      // Auto-generate low stock alert if applicable
      if (newProduct.currentStock <= newProduct.reorderPoint) {
        const alertType =
          newProduct.currentStock === 0 ? "out_of_stock" : "low_stock";
        await db.insert(reorderAlerts).values({
          productId: newProduct.id,
          alertType,
          currentStock: newProduct.currentStock,
          reorderPoint: newProduct.reorderPoint,
        });
      }

      return reply.status(201).send({ data: newProduct });
    },
  );

  // ── PUT /api/v1/inventory/products/:id ──────────────────────────────────
  app.put(
    "/api/v1/inventory/products/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = requireUserId(request, reply);
      if (userId === null) return;

      const params = parseQuery(IdParamSchema, request.params, reply);
      if (params === null) return;

      const body = parseBody(UpdateProductSchema, request.body, reply);
      if (body === null) return;

      const db = getDb();

      // Verify ownership
      const existing = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, params.id), eq(products.userId, userId)));

      if (existing.length === 0) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Product not found",
        });
      }

      // Build update payload — only include fields that are explicitly present
      // to satisfy exactOptionalPropertyTypes strict mode.
      type UpdateFields = {
        updatedAt: Date;
        name?: string;
        category?: string;
        purchasePrice?: number;
        sellingPrice?: number;
        currentStock?: number;
        reservedStock?: number;
        reorderPoint?: number;
        leadTimeDays?: number;
      };
      const updatePayload: UpdateFields = { updatedAt: new Date() };
      if (body.name !== undefined) updatePayload.name = body.name;
      if (body.category !== undefined) updatePayload.category = body.category;
      if (body.purchasePrice !== undefined)
        updatePayload.purchasePrice = body.purchasePrice;
      if (body.sellingPrice !== undefined)
        updatePayload.sellingPrice = body.sellingPrice;
      if (body.currentStock !== undefined)
        updatePayload.currentStock = body.currentStock;
      if (body.reservedStock !== undefined)
        updatePayload.reservedStock = body.reservedStock;
      if (body.reorderPoint !== undefined)
        updatePayload.reorderPoint = body.reorderPoint;
      if (body.leadTimeDays !== undefined)
        updatePayload.leadTimeDays = body.leadTimeDays;

      const updated = await db
        .update(products)
        .set(updatePayload)
        .where(and(eq(products.id, params.id), eq(products.userId, userId)))
        .returning();

      return reply.status(200).send({ data: updated[0] });
    },
  );

  // ── GET /api/v1/inventory/abc-analysis ──────────────────────────────────
  app.get(
    "/api/v1/inventory/abc-analysis",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = requireUserId(request, reply);
      if (userId === null) return;

      try {
        const result = await runAbcAnalysis(userId);
        return reply.status(200).send({ data: result });
      } catch (err: unknown) {
        request.log.error({ err }, "ABC analysis failed");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "ABC analysis failed",
        });
      }
    },
  );

  // ── GET /api/v1/inventory/deadstock ─────────────────────────────────────
  app.get(
    "/api/v1/inventory/deadstock",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = requireUserId(request, reply);
      if (userId === null) return;

      try {
        const result = await analyzeDeadStock(userId);
        return reply.status(200).send({ data: result });
      } catch (err: unknown) {
        request.log.error({ err }, "Dead stock analysis failed");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Dead stock analysis failed",
        });
      }
    },
  );

  // ── GET /api/v1/inventory/reorder-alerts ────────────────────────────────
  app.get(
    "/api/v1/inventory/reorder-alerts",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = requireUserId(request, reply);
      if (userId === null) return;

      const db = getDb();

      // Join alerts with products to include product info
      const alerts = await db
        .select({
          alert: reorderAlerts,
          product: {
            id: products.id,
            sku: products.sku,
            name: products.name,
            category: products.category,
            userId: products.userId,
          },
        })
        .from(reorderAlerts)
        .innerJoin(products, eq(reorderAlerts.productId, products.id))
        .where(
          and(
            eq(products.userId, userId),
            eq(reorderAlerts.isAcknowledged, false),
          ),
        )
        .orderBy(desc(reorderAlerts.createdAt));

      return reply.status(200).send({ data: alerts });
    },
  );

  // ── POST /api/v1/inventory/forecast ─────────────────────────────────────
  app.post(
    "/api/v1/inventory/forecast",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = requireUserId(request, reply);
      if (userId === null) return;

      const body = parseBody(ForecastBodySchema, request.body, reply);
      if (body === null) return;

      try {
        const result = await forecastProduct(body.productId, userId);
        return reply.status(200).send({ data: result });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Forecast failed";
        const isNotFound = message.includes("not found");
        return reply
          .status(isNotFound ? 404 : 500)
          .send({
            statusCode: isNotFound ? 404 : 500,
            error: isNotFound ? "Not Found" : "Internal Server Error",
            message,
          });
      }
    },
  );

  // ── POST /api/v1/inventory/acknowledge-alert/:id ─────────────────────────
  app.post(
    "/api/v1/inventory/acknowledge-alert/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = requireUserId(request, reply);
      if (userId === null) return;

      const params = parseQuery(IdParamSchema, request.params, reply);
      if (params === null) return;

      const db = getDb();

      // Verify the alert belongs to a product owned by the user
      const alertRows = await db
        .select({ alertId: reorderAlerts.id })
        .from(reorderAlerts)
        .innerJoin(products, eq(reorderAlerts.productId, products.id))
        .where(
          and(
            eq(reorderAlerts.id, params.id),
            eq(products.userId, userId),
          ),
        );

      if (alertRows.length === 0) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Alert not found",
        });
      }

      await db
        .update(reorderAlerts)
        .set({ isAcknowledged: true })
        .where(eq(reorderAlerts.id, params.id));

      return reply.status(200).send({
        data: { id: params.id, acknowledged: true },
      });
    },
  );
}
