// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — marketplace-hub: HTTP routes
//
// Routes:
//  POST   /api/v1/marketplace/accounts                     Connect account (OAuth callback)
//  GET    /api/v1/marketplace/accounts                     List accounts
//  DELETE /api/v1/marketplace/accounts/:accountId          Disconnect account
//  GET    /api/v1/marketplace/auth/:platform               Get OAuth URL
//
//  POST   /api/v1/marketplace/products/:sku/publish        Publish product to platform
//
//  GET    /api/v1/marketplace/orders                       List orders
//  GET    /api/v1/marketplace/orders/:orderId              Get single order
//  PUT    /api/v1/marketplace/orders/:orderId/fulfill      Fulfil order (tracking)
//
//  GET    /api/v1/marketplace/stock/:sku                   Get stock info
//  PUT    /api/v1/marketplace/stock/:sku                   Update stock
//
//  POST   /api/v1/webhooks/:platform                       Inbound webhook handler
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc, inArray } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Brand cast helpers — Zod-branded types require explicit casting
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asEventId = (id: string): any => id;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asCorrelationId = (id: string): any => id;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asUserId = (id: string): any => id;
import { getDb } from "../db/client.js";
import { sellerAccounts, orders, productListings, idempotencyKeys } from "../db/schema.js";
import type { AccountService } from "../services/account.service.js";
import type { StockSyncService } from "../services/stock-sync.service.js";
import type { MarketplaceConnector } from "../types/marketplace.js";
import type { NatsPublisher } from "../services/nats.publisher.js";
import type { Logger } from "pino";
import { MARKETPLACE_PLATFORMS } from "../types/marketplace.js";
import { decrypt } from "@ecompilot/shared-security";
import { env } from "../config/env.js";

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────────

const PlatformSchema = z.enum(MARKETPLACE_PLATFORMS as unknown as [string, ...string[]]);

const ConnectAccountBodySchema = z.object({
  platform: PlatformSchema,
  code: z.string().min(1, "Authorization code required"),
  state: z.string().min(1, "State required"),
});

const PublishProductBodySchema = z.object({
  platform: PlatformSchema,
  accountId: z.string().uuid(),
  product: z.object({
    sku: z.string().min(1),
    ean: z.string().nullable().optional(),
    title: z.record(z.string()),
    description: z.record(z.string()),
    priceGrosze: z.number().int().positive(),
    stock: z.number().int().nonnegative(),
    images: z.array(z.object({ url: z.string().url(), position: z.number().int() })),
    attributes: z.array(z.object({ name: z.string(), value: z.string(), unit: z.string().optional() })),
    category: z.object({
      id: z.string(),
      name: z.string(),
      mappings: z.record(z.string()),
    }),
    weightGrams: z.number().positive(),
    condition: z.enum(["new", "used_like_new", "used_good", "used_acceptable", "refurbished"]),
    shippingProfiles: z.array(z.object({
      profileId: z.string(),
      carrier: z.string(),
      price: z.number(),
      currency: z.enum(["PLN", "EUR", "USD"]),
      estimatedDaysMin: z.number().int(),
      estimatedDaysMax: z.number().int(),
    })),
  }),
});

const FulfillOrderBodySchema = z.object({
  trackingNumber: z.string().min(1),
  carrier: z.string().min(1),
});

const UpdateStockBodySchema = z.object({
  quantity: z.number().int().nonnegative(),
  /** Optional: only update a specific platform */
  platform: PlatformSchema.optional(),
  accountId: z.string().uuid().optional(),
});

const OrdersQuerySchema = z.object({
  platform: PlatformSchema.optional(),
  status: z.enum(["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "returned", "refunded"]).optional(),
  page: z.string().default("1").transform(Number),
  limit: z.string().default("20").transform(Number),
});

// ─────────────────────────────────────────────────────────────────────────────
// Route factory
// ─────────────────────────────────────────────────────────────────────────────

export interface MarketplaceRouteContext {
  readonly accountService: AccountService;
  readonly stockSync: StockSyncService;
  readonly connectors: Map<string, MarketplaceConnector>;
  readonly nats: NatsPublisher;
  readonly logger: Logger;
}

export async function registerMarketplaceRoutes(
  app: FastifyInstance,
  ctx: MarketplaceRouteContext,
): Promise<void> {
  const db = getDb();

  // ── GET /api/v1/marketplace/auth/:platform ─────────────────────────────

  app.get("/api/v1/marketplace/auth/:platform", async (request, reply) => {
    const platformResult = PlatformSchema.safeParse(
      (request.params as Record<string, string>)["platform"],
    );
    if (!platformResult.success) {
      return reply.status(400).send({ success: false, error: "Invalid platform" });
    }

    const platform = platformResult.data;
    const state = crypto.randomUUID();

    // Store state in Redis for CSRF validation (simplified — use Redis in prod)
    try {
      const url = ctx.accountService.getAuthorizationUrl(platform as "allegro", state);
      return { success: true, data: { authorizationUrl: url, state } };
    } catch (err) {
      ctx.logger.error({ platform, err }, "Failed to get authorization URL");
      return reply.status(400).send({
        success: false,
        error: "Platform connector not available",
      });
    }
  });

  // ── POST /api/v1/marketplace/accounts ─────────────────────────────────

  app.post("/api/v1/marketplace/accounts", async (request, reply) => {
    const body = ConnectAccountBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        success: false,
        error: "Validation failed",
        details: body.error.flatten(),
      });
    }

    const userId = getUserId(request);
    if (userId === null) {
      return reply.status(401).send({ success: false, error: "Unauthorized" });
    }

    try {
      const account = await ctx.accountService.connectAccount(
        userId,
        body.data.platform as "allegro",
        body.data.code,
        body.data.state,
      );
      return reply.status(201).send({ success: true, data: account });
    } catch (err) {
      ctx.logger.error({ err, platform: body.data.platform }, "Failed to connect account");
      return reply.status(400).send({
        success: false,
        error: err instanceof Error ? err.message : "Failed to connect account",
      });
    }
  });

  // ── GET /api/v1/marketplace/accounts ──────────────────────────────────

  app.get("/api/v1/marketplace/accounts", async (request, reply) => {
    const userId = getUserId(request);
    if (userId === null) {
      return reply.status(401).send({ success: false, error: "Unauthorized" });
    }

    try {
      const accounts = await ctx.accountService.listAccounts(userId);
      return { success: true, data: accounts };
    } catch (err) {
      ctx.logger.error({ err }, "Failed to list accounts");
      return reply.status(500).send({ success: false, error: "Internal error" });
    }
  });

  // ── DELETE /api/v1/marketplace/accounts/:accountId ────────────────────

  app.delete("/api/v1/marketplace/accounts/:accountId", async (request, reply) => {
    const userId = getUserId(request);
    if (userId === null) {
      return reply.status(401).send({ success: false, error: "Unauthorized" });
    }

    const accountId = (request.params as Record<string, string>)["accountId"];
    if (accountId === undefined) {
      return reply.status(400).send({ success: false, error: "accountId required" });
    }

    try {
      await ctx.accountService.disconnectAccount(userId, accountId);
      return reply.status(204).send();
    } catch (err) {
      ctx.logger.error({ err, accountId }, "Failed to disconnect account");
      return reply.status(404).send({ success: false, error: "Account not found" });
    }
  });

  // ── POST /api/v1/marketplace/products/:sku/publish ────────────────────

  app.post("/api/v1/marketplace/products/:sku/publish", async (request, reply) => {
    const userId = getUserId(request);
    if (userId === null) {
      return reply.status(401).send({ success: false, error: "Unauthorized" });
    }

    const sku = (request.params as Record<string, string>)["sku"];
    const body = PublishProductBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        success: false,
        error: "Validation failed",
        details: body.error.flatten(),
      });
    }

    const { platform, accountId, product } = body.data;

    // Verify account belongs to user
    const account = await db.query.sellerAccounts.findFirst({
      where: and(
        eq(sellerAccounts.id, accountId),
        eq(sellerAccounts.userId, userId),
        eq(sellerAccounts.active, true),
      ),
    });

    if (account === undefined) {
      return reply.status(404).send({
        success: false,
        error: "Seller account not found or inactive",
      });
    }

    const connector = ctx.connectors.get(platform);
    if (connector === undefined) {
      return reply.status(400).send({
        success: false,
        error: `Platform ${platform} not supported`,
      });
    }

    try {
      const auth = await ctx.accountService.getAuthContext(accountId);

      const canonicalProduct: import("../types/marketplace.js").CanonicalProduct = {
        id: crypto.randomUUID(),
        sku: product.sku as ReturnType<typeof import("../types/marketplace.js").asSku>,
        ean: product.ean
          ? (product.ean as ReturnType<typeof import("../types/marketplace.js").asEan>)
          : null,
        title: product.title as import("../types/marketplace.js").I18nString,
        description: product.description as import("../types/marketplace.js").I18nString,
        priceGrosze: product.priceGrosze,
        stock: product.stock,
        images: product.images.map((img) => ({
          url: img.url,
          position: img.position,
          altText: undefined as string | undefined,
        })),
        attributes: product.attributes.map((a) => ({
          name: a.name,
          value: a.value,
          unit: a.unit as string | undefined,
        })),
        category: {
          id: product.category.id,
          name: product.category.name,
          mappings: product.category.mappings as Partial<
            Record<import("../types/marketplace.js").MarketplacePlatform, string>
          >,
        },
        weightGrams: product.weightGrams,
        dimensions: null,
        condition: product.condition,
        shippingProfiles: product.shippingProfiles,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await connector.createOffer(canonicalProduct, auth);

      // Persist listing record
      await db
        .insert(productListings)
        .values({
          accountId,
          platform: platform as "allegro",
          sku: product.sku,
          ean: product.ean ?? null,
          externalOfferId: result.externalOfferId,
          status: result.status === "active" ? "active" : "pending",
          listingUrl: result.url ?? null,
          publishedPriceGrosze: product.priceGrosze,
          publishedStock: product.stock,
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            productListings.sku,
            productListings.platform,
            productListings.accountId,
          ],
          set: {
            externalOfferId: result.externalOfferId,
            status: result.status === "active" ? "active" : "pending",
            listingUrl: result.url ?? null,
            publishedPriceGrosze: product.priceGrosze,
            publishedStock: product.stock,
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          },
        });

      await ctx.nats.publishOfferPublished({
        sku: product.sku,
        platform,
        externalOfferId: result.externalOfferId,
        listingUrl: result.url,
        accountId,
      });

      return reply.status(201).send({ success: true, data: result });
    } catch (err) {
      ctx.logger.error({ err, sku, platform }, "Failed to publish product");
      return reply.status(400).send({
        success: false,
        error: err instanceof Error ? err.message : "Failed to publish product",
      });
    }
  });

  // ── GET /api/v1/marketplace/orders ────────────────────────────────────

  app.get("/api/v1/marketplace/orders", async (request, reply) => {
    const userId = getUserId(request);
    if (userId === null) {
      return reply.status(401).send({ success: false, error: "Unauthorized" });
    }

    const query = OrdersQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        success: false,
        error: "Invalid query params",
        details: query.error.flatten(),
      });
    }

    const { platform, status, page, limit } = query.data;
    const offset = (page - 1) * limit;

    // Get user's account IDs
    const userAccounts = await db
      .select({ id: sellerAccounts.id })
      .from(sellerAccounts)
      .where(eq(sellerAccounts.userId, userId));

    const accountIds = userAccounts.map((a) => a.id);
    if (accountIds.length === 0) {
      return { success: true, data: { items: [], total: 0, page, limit, hasMore: false } };
    }

    let queryBuilder = db
      .select()
      .from(orders)
      .orderBy(desc(orders.marketplaceCreatedAt))
      .$dynamic();

    // Build where clause from active filters
    const baseCondition = inArray(orders.accountId, accountIds);
    const platformCondition =
      platform !== undefined
        ? eq(orders.platform, platform as "allegro")
        : undefined;
    const statusCondition =
      status !== undefined ? eq(orders.status, status) : undefined;

    const whereClause =
      platformCondition !== undefined && statusCondition !== undefined
        ? and(baseCondition, platformCondition, statusCondition)
        : platformCondition !== undefined
          ? and(baseCondition, platformCondition)
          : statusCondition !== undefined
            ? and(baseCondition, statusCondition)
            : baseCondition;

    queryBuilder = queryBuilder.where(whereClause);

    const allOrders = await queryBuilder.offset(offset).limit(limit);

    // Mask PII in list response — only show city, country, item count
    const safeOrders = allOrders.map((o) => ({
      id: o.id,
      platform: o.platform,
      marketplaceOrderId: o.marketplaceOrderId,
      status: o.status,
      shippingCity: o.shippingCity,
      shippingCountryCode: o.shippingCountryCode,
      itemCount: Array.isArray(o.items) ? o.items.length : 0,
      totalPriceGrosze: o.totalPriceGrosze,
      paymentStatus: o.paymentStatus,
      marketplaceCreatedAt: o.marketplaceCreatedAt,
      trackingNumber: o.trackingNumber,
      shippingCarrier: o.shippingCarrier,
    }));

    return {
      success: true,
      data: {
        items: safeOrders,
        page,
        limit,
        hasMore: allOrders.length === limit,
      },
    };
  });

  // ── GET /api/v1/marketplace/orders/:orderId ────────────────────────────

  app.get("/api/v1/marketplace/orders/:orderId", async (request, reply) => {
    const userId = getUserId(request);
    if (userId === null) {
      return reply.status(401).send({ success: false, error: "Unauthorized" });
    }

    const orderId = (request.params as Record<string, string>)["orderId"];
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId ?? ""),
      with: { account: { columns: { userId: true } } },
    });

    if (order === undefined) {
      return reply.status(404).send({ success: false, error: "Order not found" });
    }

    // Ownership check
    if (order.account.userId !== userId) {
      return reply.status(403).send({ success: false, error: "Forbidden" });
    }

    // Decrypt PII for authorised access
    const decryptedOrder = {
      ...order,
      buyerName: decrypt(order.encryptedBuyerName, env.ENCRYPTION_KEY),
      buyerEmail: decrypt(order.encryptedBuyerEmail, env.ENCRYPTION_KEY),
      buyerPhone: order.encryptedBuyerPhone !== null
        ? decrypt(order.encryptedBuyerPhone, env.ENCRYPTION_KEY)
        : null,
      shippingStreet: order.encryptedShippingStreet !== null
        ? decrypt(order.encryptedShippingStreet, env.ENCRYPTION_KEY)
        : null,
      // Remove encrypted fields from response
      encryptedBuyerName: undefined,
      encryptedBuyerEmail: undefined,
      encryptedBuyerPhone: undefined,
      encryptedShippingStreet: undefined,
    };

    return { success: true, data: decryptedOrder };
  });

  // ── PUT /api/v1/marketplace/orders/:orderId/fulfill ───────────────────

  app.put("/api/v1/marketplace/orders/:orderId/fulfill", async (request, reply) => {
    const userId = getUserId(request);
    if (userId === null) {
      return reply.status(401).send({ success: false, error: "Unauthorized" });
    }

    const orderId = (request.params as Record<string, string>)["orderId"];
    const body = FulfillOrderBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        success: false,
        error: "Validation failed",
        details: body.error.flatten(),
      });
    }

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId ?? ""),
      with: { account: true },
    });

    if (order === undefined) {
      return reply.status(404).send({ success: false, error: "Order not found" });
    }

    if (order.account.userId !== userId) {
      return reply.status(403).send({ success: false, error: "Forbidden" });
    }

    const connector = ctx.connectors.get(order.platform);
    if (connector === undefined) {
      return reply.status(400).send({
        success: false,
        error: `No connector for platform ${order.platform}`,
      });
    }

    const auth = await ctx.accountService.getAuthContext(order.accountId);

    try {
      await connector.addTrackingNumber(
        order.marketplaceOrderId,
        body.data.trackingNumber,
        body.data.carrier,
        auth,
      );

      // Update order in DB
      await db
        .update(orders)
        .set({
          status: "shipped",
          trackingNumber: body.data.trackingNumber,
          shippingCarrier: body.data.carrier,
          shippedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId ?? ""));

      await ctx.nats.publishOrderStatusChanged({
        eventId: asEventId(crypto.randomUUID()),
        type: "marketplace.order.status_changed",
        occurredAt: new Date().toISOString(),
        correlationId: asCorrelationId(crypto.randomUUID()),
        source: "marketplace-hub",
        schemaVersion: 1,
        payload: {
          orderId: order.id,
          externalOrderId: order.marketplaceOrderId,
          userId: asUserId(order.account.userId),
          marketplace: order.platform as "allegro",
          previousStatus: order.status,
          newStatus: "shipped",
          changedAt: new Date().toISOString(),
          reason: `Tracking: ${body.data.trackingNumber}`,
        },
      });

      return { success: true, data: { orderId, status: "shipped", trackingNumber: body.data.trackingNumber } };
    } catch (err) {
      ctx.logger.error({ err, orderId, platform: order.platform }, "Failed to fulfil order");
      return reply.status(400).send({
        success: false,
        error: err instanceof Error ? err.message : "Failed to fulfil order",
      });
    }
  });

  // ── GET /api/v1/marketplace/stock/:sku ────────────────────────────────

  app.get("/api/v1/marketplace/stock/:sku", async (request, reply) => {
    const userId = getUserId(request);
    if (userId === null) {
      return reply.status(401).send({ success: false, error: "Unauthorized" });
    }

    const sku = (request.params as Record<string, string>)["sku"];
    if (sku === undefined) {
      return reply.status(400).send({ success: false, error: "sku required" });
    }

    const reserved = await ctx.stockSync.getReservedQuantity(sku);

    const listings = await db
      .select({
        platform: productListings.platform,
        publishedStock: productListings.publishedStock,
        status: productListings.status,
        lastSyncedAt: productListings.lastSyncedAt,
        accountId: productListings.accountId,
      })
      .from(productListings)
      .innerJoin(
        sellerAccounts,
        eq(productListings.accountId, sellerAccounts.id),
      )
      .where(
        and(
          eq(productListings.sku, sku),
          eq(sellerAccounts.userId, userId),
        ),
      );

    return {
      success: true,
      data: {
        sku,
        reserved,
        platformListings: listings.map((l) => ({
          platform: l.platform,
          publishedStock: l.publishedStock,
          status: l.status,
          lastSyncedAt: l.lastSyncedAt,
        })),
      },
    };
  });

  // ── PUT /api/v1/marketplace/stock/:sku ────────────────────────────────

  app.put("/api/v1/marketplace/stock/:sku", async (request, reply) => {
    const userId = getUserId(request);
    if (userId === null) {
      return reply.status(401).send({ success: false, error: "Unauthorized" });
    }

    const sku = (request.params as Record<string, string>)["sku"];
    if (sku === undefined) {
      return reply.status(400).send({ success: false, error: "sku required" });
    }

    const body = UpdateStockBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({
        success: false,
        error: "Validation failed",
        details: body.error.flatten(),
      });
    }

    try {
      // Sync to all platforms (or specific one if provided)
      const result = await ctx.stockSync.syncStockToAllPlatforms(
        sku,
        body.data.quantity,
      );

      return { success: true, data: result };
    } catch (err) {
      ctx.logger.error({ err, sku }, "Failed to update stock");
      return reply.status(400).send({
        success: false,
        error: err instanceof Error ? err.message : "Failed to update stock",
      });
    }
  });

  // ── POST /api/v1/webhooks/:platform ───────────────────────────────────

  app.post("/api/v1/webhooks/:platform", async (request, reply) => {
    const platform = (request.params as Record<string, string>)["platform"];
    const platformResult = PlatformSchema.safeParse(platform);

    if (!platformResult.success) {
      return reply.status(400).send({ success: false, error: "Unknown platform" });
    }

    const webhookPlatform = platformResult.data;

    // Idempotency check — use platform + request ID as key
    const webhookEventId =
      (request.headers["x-webhook-event-id"] as string | undefined) ??
      (request.headers["x-amzn-sns-messageid"] as string | undefined) ??
      (request.headers["x-event-id"] as string | undefined) ??
      crypto.randomUUID();

    const idempotencyKey = `webhook:${webhookPlatform}:${webhookEventId}`;

    const existing = await db.query.idempotencyKeys.findFirst({
      where: and(
        eq(idempotencyKeys.key, webhookEventId),
        eq(idempotencyKeys.source, `webhook:${webhookPlatform}`),
      ),
    });

    if (existing !== undefined) {
      ctx.logger.debug(
        { platform: webhookPlatform, eventId: webhookEventId },
        "Duplicate webhook — returning cached response",
      );
      return reply
        .status(existing.resultCode ?? 200)
        .send(existing.resultBody ?? { success: true, deduplicated: true });
    }

    // Platform-specific webhook verification
    const verified = await verifyWebhookSignature(
      request,
      webhookPlatform,
      ctx.logger,
    );

    if (!verified) {
      return reply.status(401).send({ success: false, error: "Invalid webhook signature" });
    }

    // Process webhook payload
    const payload = request.body as Record<string, unknown>;

    ctx.logger.info(
      { platform: webhookPlatform, eventId: webhookEventId },
      "Processing inbound webhook",
    );

    // Store idempotency key (persist before processing to prevent duplicate processing
    // on concurrent requests — process-once semantics)
    await db.insert(idempotencyKeys).values({
      key: webhookEventId,
      source: `webhook:${webhookPlatform}`,
      resultCode: 200,
      resultBody: { success: true, received: true },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    });

    ctx.logger.debug(
      { platform: webhookPlatform, eventId: webhookEventId, payload },
      "Webhook payload received",
    );

    // Acknowledge immediately — async processing via BullMQ in production
    return reply.status(200).send({
      success: true,
      received: true,
      eventId: webhookEventId,
      idempotencyKey,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getUserId(
  request: {
    readonly headers: Record<string, string | string[] | undefined>;
    readonly authUser?: { sub: string } | null;
  },
): string | null {
  // Reads from verified JWT payload set by shared-auth middleware
  const userId = (request as unknown as { authUser?: { sub?: string } | null }).authUser?.sub;
  return userId ?? null;
}

async function verifyWebhookSignature(
  request: { headers: Record<string, string | string[] | undefined>; body: unknown },
  platform: string,
  logger: Logger,
): Promise<boolean> {
  // Platform-specific signature verification
  switch (platform) {
    case "allegro":
      // Allegro webhooks (Phase 2 — when webhooks are enabled)
      // Verify HMAC-SHA256 signature in X-Allegro-Signature header
      return true; // Placeholder

    case "amazon":
      // Amazon SNS messages have their own signing scheme
      // Verify via https://sns.amazonaws.com signature
      return true; // Placeholder

    default:
      logger.warn({ platform }, "No webhook signature verification for platform");
      return true;
  }
}
