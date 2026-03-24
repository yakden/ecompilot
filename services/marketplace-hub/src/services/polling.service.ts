// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — marketplace-hub: BullMQ polling service
//
// Polling schedule for marketplaces without webhooks:
//  • Orders:  Allegro every 2min | Erli every 5min
//  • Stock:   Allegro every 5min | Amazon every 10min
//  • Offers:  Allegro every 30min
//
// BullMQ repeatable jobs, one worker per job type.
// Redis is required for BullMQ — imported via ioredis (peer dep of bullmq).
// ─────────────────────────────────────────────────────────────────────────────

import { Queue, Worker, type Job, type RepeatOptions } from "bullmq";
import type { Redis } from "./redis.client.js";
import type { Logger } from "pino";
import type { Db } from "../db/client.js";
import { sellerAccounts, productListings } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { decrypt } from "@ecompilot/shared-security";
import { env } from "../config/env.js";
import type { MarketplaceConnector, ConnectorAuthContext } from "../types/marketplace.js";
import type { NatsPublisher } from "./nats.publisher.js";
import type { StockSyncService } from "./stock-sync.service.js";

// Brand cast helpers — Zod-branded types require explicit casting
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asEventId = (id: string): any => id;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asCorrelationId = (id: string): any => id;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asUserId = (id: string): any => id;

// ─────────────────────────────────────────────────────────────────────────────
// Job name constants
// ─────────────────────────────────────────────────────────────────────────────

const QUEUE_NAME = "marketplace-polling" as const;

export const JOB_NAMES = {
  POLL_ALLEGRO_ORDERS: "poll:allegro:orders",
  POLL_ALLEGRO_STOCK: "poll:allegro:stock",
  POLL_ALLEGRO_OFFERS: "poll:allegro:offers",
  POLL_ERLI_ORDERS: "poll:erli:orders",
  POLL_AMAZON_STOCK: "poll:amazon:stock",
  SWEEP_EXPIRED_RESERVATIONS: "maintenance:sweep:reservations",
  SWEEP_IDEMPOTENCY_KEYS: "maintenance:sweep:idempotency",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

// ─────────────────────────────────────────────────────────────────────────────
// Job data types
// ─────────────────────────────────────────────────────────────────────────────

export interface PollJobData {
  readonly platform: string;
  /** Polling cursor from last successful run (stored in Redis) */
  readonly lastCursor: string | null;
}

export interface MaintenanceJobData {
  readonly type: "sweep_reservations" | "sweep_idempotency";
}

export type AnyJobData = PollJobData | MaintenanceJobData;

// ─────────────────────────────────────────────────────────────────────────────
// Schedule configuration
// ─────────────────────────────────────────────────────────────────────────────

interface JobSchedule {
  readonly name: JobName;
  readonly repeat: RepeatOptions;
  readonly data: AnyJobData;
}

const JOB_SCHEDULES: readonly JobSchedule[] = [
  // Orders polling
  {
    name: JOB_NAMES.POLL_ALLEGRO_ORDERS,
    repeat: { every: 2 * 60 * 1000 }, // 2 min
    data: { platform: "allegro", lastCursor: null },
  },
  {
    name: JOB_NAMES.POLL_ERLI_ORDERS,
    repeat: { every: 5 * 60 * 1000 }, // 5 min
    data: { platform: "erli", lastCursor: null },
  },
  // Stock polling
  {
    name: JOB_NAMES.POLL_ALLEGRO_STOCK,
    repeat: { every: 5 * 60 * 1000 }, // 5 min
    data: { platform: "allegro", lastCursor: null },
  },
  {
    name: JOB_NAMES.POLL_AMAZON_STOCK,
    repeat: { every: 10 * 60 * 1000 }, // 10 min
    data: { platform: "amazon", lastCursor: null },
  },
  // Offer polling
  {
    name: JOB_NAMES.POLL_ALLEGRO_OFFERS,
    repeat: { every: 30 * 60 * 1000 }, // 30 min
    data: { platform: "allegro", lastCursor: null },
  },
  // Maintenance
  {
    name: JOB_NAMES.SWEEP_EXPIRED_RESERVATIONS,
    repeat: { every: 5 * 60 * 1000 }, // 5 min
    data: { type: "sweep_reservations" },
  },
  {
    name: JOB_NAMES.SWEEP_IDEMPOTENCY_KEYS,
    repeat: { every: 60 * 60 * 1000 }, // 1 hour
    data: { type: "sweep_idempotency" },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PollingService
// ─────────────────────────────────────────────────────────────────────────────

export class PollingService {
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly redis: Redis,
    private readonly db: Db,
    private readonly connectors: Map<string, MarketplaceConnector>,
    private readonly stockSync: StockSyncService,
    private readonly nats: NatsPublisher,
    private readonly logger: Logger,
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const redisConnection = { connection: this.redis };

    this.queue = new Queue(QUEUE_NAME, redisConnection);

    // Register repeatable jobs
    for (const schedule of JOB_SCHEDULES) {
      await this.queue.add(schedule.name, schedule.data, {
        repeat: schedule.repeat,
        jobId: `repeat:${schedule.name}`,
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      });

      this.logger.info(
        { jobName: schedule.name, everyMs: (schedule.repeat as { every: number }).every },
        "Registered repeatable polling job",
      );
    }

    this.worker = new Worker<AnyJobData>(
      QUEUE_NAME,
      async (job: Job<AnyJobData>) => this.processJob(job),
      {
        ...redisConnection,
        concurrency: env.POLLING_CONCURRENCY,
        limiter: {
          max: 10,
          duration: 1000,
        },
      },
    );

    this.worker.on("completed", (job: Job<AnyJobData>) => {
      this.logger.debug(
        { jobId: job.id, jobName: job.name },
        "Polling job completed",
      );
    });

    this.worker.on("failed", (job: Job<AnyJobData> | undefined, err: unknown) => {
      this.logger.error(
        { jobId: job?.id, jobName: job?.name, err },
        "Polling job failed",
      );
    });

    this.logger.info("Polling service started");
  }

  async stop(): Promise<void> {
    if (this.worker !== null) {
      await this.worker.close();
      this.worker = null;
    }
    if (this.queue !== null) {
      await this.queue.close();
      this.queue = null;
    }
    this.logger.info("Polling service stopped");
  }

  // ── Job dispatch ──────────────────────────────────────────────────────────

  private async processJob(job: Job<AnyJobData>): Promise<void> {
    const data = job.data;

    // Maintenance jobs
    if ("type" in data) {
      switch (data.type) {
        case "sweep_reservations":
          await this.stockSync.sweepExpiredReservations();
          return;
        case "sweep_idempotency":
          await this.sweepIdempotencyKeys();
          return;
      }
    }

    // Polling jobs
    const { platform, lastCursor } = data as PollJobData;

    switch (job.name as JobName) {
      case JOB_NAMES.POLL_ALLEGRO_ORDERS:
      case JOB_NAMES.POLL_ERLI_ORDERS:
        await this.pollOrders(platform, lastCursor, job);
        break;

      case JOB_NAMES.POLL_ALLEGRO_STOCK:
      case JOB_NAMES.POLL_AMAZON_STOCK:
        await this.pollStock(platform, lastCursor, job);
        break;

      case JOB_NAMES.POLL_ALLEGRO_OFFERS:
        await this.pollOffers(platform, lastCursor, job);
        break;

      default:
        this.logger.warn({ jobName: job.name }, "Unknown polling job");
    }
  }

  // ── Order polling ─────────────────────────────────────────────────────────

  private async pollOrders(
    platform: string,
    lastCursor: string | null,
    job: Job<AnyJobData>,
  ): Promise<void> {
    const connector = this.connectors.get(platform);
    if (connector === undefined) {
      this.logger.warn({ platform }, "No connector for platform — skipping order poll");
      return;
    }

    const accounts = await this.getActiveAccounts(platform);
    if (accounts.length === 0) return;

    for (const account of accounts) {
      const auth = this.buildAuth(account);

      try {
        // Use event feed for Allegro (more efficient than full order list)
        const cursorKey = `cursor:orders:${platform}:${account.id}`;
        const storedCursor = await this.redis.get(cursorKey);
        const cursor = lastCursor ?? storedCursor ?? undefined;

        const result = await connector.pollOrderEvents(
          auth,
          cursor ?? undefined,
        );

        for (const event of result.events) {
          if (event.type === "order_created" || event.type === "order_updated") {
            try {
              const order = await connector.getOrder(event.orderId, auth);

              // Publish NATS event for new orders
              if (event.type === "order_created") {
                await this.nats.publishOrderCreated({
                  eventId: asEventId(crypto.randomUUID()),
                  type: "marketplace.order.created",
                  occurredAt: new Date().toISOString(),
                  correlationId: asCorrelationId(crypto.randomUUID()),
                  source: "marketplace-hub",
                  schemaVersion: 1,
                  payload: {
                    orderId: order.id,
                    externalOrderId: order.marketplaceOrderId,
                    userId: asUserId(account.userId),
                    organizationId: null,
                    marketplace: platform === "allegro" ? "allegro" : "ebay",
                    buyerName: "Encrypted",
                    items: order.items.map((item) => ({
                      sku: item.sku,
                      name: item.name,
                      quantity: item.quantity,
                      unitPrice: {
                        amount: item.unitPriceGrosze / 100,
                        currency: "PLN" as const,
                      },
                      totalPrice: {
                        amount: item.totalPriceGrosze / 100,
                        currency: "PLN" as const,
                      },
                    })),
                    totalAmount: {
                      amount: order.payment.paidGrosze / 100,
                      currency: "PLN" as const,
                    },
                    status: "confirmed",
                    shippingAddress: {
                      street: "Encrypted",
                      city: order.shipping.shippingAddress.city,
                      postalCode: order.shipping.shippingAddress.postalCode,
                      country: order.shipping.shippingAddress.countryCode,
                    },
                    createdAt: order.timestamps.createdAt.toISOString(),
                  },
                });
              }
            } catch (orderErr) {
              this.logger.warn(
                { orderId: event.orderId, platform, err: orderErr },
                "Failed to fetch order during poll",
              );
            }
          }
        }

        // Persist cursor
        if (result.nextCursor !== null) {
          await this.redis.set(cursorKey, result.nextCursor, "EX", 86400);
          // Update job data for next run
          await job.updateData({
            ...(job.data as PollJobData),
            lastCursor: result.nextCursor,
          });
        }

        this.logger.info(
          {
            platform,
            accountId: account.id,
            eventsCount: result.events.length,
          },
          "Order poll completed",
        );
      } catch (err) {
        this.logger.error(
          { platform, accountId: account.id, err },
          "Order polling failed for account",
        );
      }
    }
  }

  // ── Stock polling ─────────────────────────────────────────────────────────

  private async pollStock(
    platform: string,
    _lastCursor: string | null,
    _job: Job<AnyJobData>,
  ): Promise<void> {
    const connector = this.connectors.get(platform);
    if (connector === undefined) {
      this.logger.warn({ platform }, "No connector for platform — skipping stock poll");
      return;
    }

    // Find all active listings for this platform and verify stock is in sync
    const listings = await this.db
      .select({
        sku: productListings.sku,
        publishedStock: productListings.publishedStock,
        accountId: productListings.accountId,
      })
      .from(productListings)
      .where(
        and(
          eq(productListings.platform, platform as "allegro" | "amazon" | "ebay" | "etsy" | "olx" | "vinted" | "empik" | "erli"),
          eq(productListings.status, "active"),
        ),
      );

    this.logger.info(
      { platform, listingCount: listings.length },
      "Stock poll — checking listings",
    );

    // Group by SKU to avoid duplicate syncs
    const skuSet = new Set(listings.map((l) => l.sku));
    for (const sku of skuSet) {
      const listing = listings.find((l) => l.sku === sku);
      const currentStock = listing?.publishedStock ?? 0;
      // Re-sync using published stock as physical stock estimate
      // In production: would pull from warehouse/ERP system
      await this.stockSync.syncStockToAllPlatforms(sku, currentStock).catch((err) => {
        this.logger.warn({ sku, platform, err }, "Stock poll sync failed for SKU");
      });
    }
  }

  // ── Offer polling ─────────────────────────────────────────────────────────

  private async pollOffers(
    platform: string,
    lastCursor: string | null,
    job: Job<AnyJobData>,
  ): Promise<void> {
    const connector = this.connectors.get(platform);
    if (connector === undefined) {
      this.logger.warn({ platform }, "No connector for platform — skipping offer poll");
      return;
    }

    const accounts = await this.getActiveAccounts(platform);

    for (const account of accounts) {
      const auth = this.buildAuth(account);

      try {
        const cursorKey = `cursor:offers:${platform}:${account.id}`;
        const storedCursor = await this.redis.get(cursorKey);
        const cursor = lastCursor ?? storedCursor ?? undefined;

        const result = await connector.pollOfferEvents(auth, cursor ?? undefined);

        if (result.nextCursor !== null) {
          await this.redis.set(cursorKey, result.nextCursor, "EX", 86400);
          await job.updateData({
            ...(job.data as PollJobData),
            lastCursor: result.nextCursor,
          });
        }

        this.logger.info(
          {
            platform,
            accountId: account.id,
            eventsCount: result.events.length,
          },
          "Offer poll completed",
        );
      } catch (err) {
        this.logger.error(
          { platform, accountId: account.id, err },
          "Offer polling failed for account",
        );
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async getActiveAccounts(platform: string) {
    return this.db
      .select({
        id: sellerAccounts.id,
        userId: sellerAccounts.userId,
        encryptedAccessToken: sellerAccounts.encryptedAccessToken,
        encryptedRefreshToken: sellerAccounts.encryptedRefreshToken,
        tokenExpiresAt: sellerAccounts.tokenExpiresAt,
      })
      .from(sellerAccounts)
      .where(
        and(
          eq(sellerAccounts.platform, platform as "allegro" | "amazon" | "ebay" | "etsy" | "olx" | "vinted" | "empik" | "erli"),
          eq(sellerAccounts.active, true),
        ),
      );
  }

  private buildAuth(account: {
    id: string;
    encryptedAccessToken: string;
    encryptedRefreshToken: string;
    tokenExpiresAt: Date;
  }): ConnectorAuthContext {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accountId: account.id as any,
      accessToken: decrypt(account.encryptedAccessToken, env.ENCRYPTION_KEY),
      refreshToken: decrypt(account.encryptedRefreshToken, env.ENCRYPTION_KEY),
      tokenExpiresAt: account.tokenExpiresAt,
    };
  }

  private async sweepIdempotencyKeys(): Promise<void> {
    // Import inline to avoid circular deps
    const { getDb } = await import("../db/client.js");
    const { idempotencyKeys } = await import("../db/schema.js");
    const { sql } = await import("drizzle-orm");

    const db = getDb();
    const deleted = await db
      .delete(idempotencyKeys)
      .where(sql`expires_at < NOW()`)
      .returning({ id: idempotencyKeys.id });

    if (deleted.length > 0) {
      this.logger.info({ count: deleted.length }, "Swept expired idempotency keys");
    }
  }
}
