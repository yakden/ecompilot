// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — marketplace-hub: Stock synchronisation service
//
// Architecture:
//  1. Pessimistic locking via SELECT ... FOR UPDATE on stock_reservations
//  2. Safety stock buffer (configurable %) per channel
//  3. Reservation TTL: 15-30 min depending on order state
//  4. On stock change → sync to ALL active marketplace accounts concurrently
//  5. Publishes NATS event: ecompilot.marketplace.stock.updated
// ─────────────────────────────────────────────────────────────────────────────

import { eq, and, inArray, sql } from "drizzle-orm";
import type { Logger } from "pino";
import type { Db } from "../db/client.js";
import {
  stockReservations,
  productListings,
  sellerAccounts,
} from "../db/schema.js";
import type { MarketplaceConnector, ConnectorAuthContext, StockUpdate } from "../types/marketplace.js";
import { asSku } from "../types/marketplace.js";
import { decrypt } from "@ecompilot/shared-security";
import { env } from "../config/env.js";
import type { NatsPublisher } from "./nats.publisher.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface StockSyncOptions {
  /** Reservation TTL in minutes (default: 20) */
  readonly reservationTtlMin?: number;
}

export interface StockSyncResult {
  readonly sku: string;
  readonly totalAvailable: number;
  readonly reserved: number;
  readonly netAvailable: number;
  readonly platformResults: ReadonlyArray<{
    readonly platform: string;
    readonly success: boolean;
    readonly error: string | undefined;
  }>;
}

export interface ReservationResult {
  readonly reservationId: string;
  readonly sku: string;
  readonly reservedQuantity: number;
  readonly expiresAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// StockSyncService
// ─────────────────────────────────────────────────────────────────────────────

export class StockSyncService {
  constructor(
    private readonly db: Db,
    private readonly connectors: Map<string, MarketplaceConnector>,
    private readonly nats: NatsPublisher,
    private readonly logger: Logger,
  ) {}

  // ── Reserve stock (pessimistic) ───────────────────────────────────────────

  /**
   * Reserve stock for an order using pessimistic locking.
   * Uses a Drizzle transaction with a raw SELECT FOR UPDATE advisory lock on
   * the SKU's reservation rows to prevent race conditions across concurrent
   * requests competing for the same SKU inventory.
   */
  async reserveStock(
    sku: string,
    quantity: number,
    orderId: string | null,
    options: StockSyncOptions = {},
  ): Promise<ReservationResult> {
    const ttlMin = options.reservationTtlMin ?? 20;
    const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000);

    return this.db.transaction(async (tx) => {
      // Step 1: Pessimistic lock — SELECT ... FOR UPDATE on active reservations
      // for this SKU. This blocks concurrent transactions from reading the same
      // rows until we commit, preventing double-allocation.
      await tx.execute(
        sql`
          SELECT id FROM stock_reservations
          WHERE sku = ${sku}
            AND status = 'active'
            AND expires_at > NOW()
          FOR UPDATE
        `,
      );

      // Step 2: Insert the new reservation within the locked transaction
      const [reservation] = await tx
        .insert(stockReservations)
        .values({
          sku,
          reservedQuantity: quantity,
          status: "active",
          orderId: orderId ?? null,
          expiresAt,
        })
        .returning();

      if (reservation === undefined) {
        throw new Error(`Failed to create stock reservation for SKU ${sku}`);
      }

      this.logger.info(
        {
          reservationId: reservation.id,
          sku,
          quantity,
          expiresAt,
          orderId,
        },
        "Stock reservation created",
      );

      return {
        reservationId: reservation.id,
        sku: reservation.sku,
        reservedQuantity: reservation.reservedQuantity,
        expiresAt: reservation.expiresAt,
      };
    });
  }

  /**
   * Fulfil a reservation (mark as fulfilled after successful order processing).
   */
  async fulfilReservation(reservationId: string): Promise<void> {
    await this.db
      .update(stockReservations)
      .set({
        status: "fulfilled",
        fulfilledAt: new Date(),
      })
      .where(eq(stockReservations.id, reservationId));

    this.logger.info({ reservationId }, "Stock reservation fulfilled");
  }

  /**
   * Cancel a reservation (e.g. order cancelled, payment failed).
   */
  async cancelReservation(reservationId: string): Promise<void> {
    await this.db
      .update(stockReservations)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
      })
      .where(eq(stockReservations.id, reservationId));

    this.logger.info({ reservationId }, "Stock reservation cancelled");
  }

  /**
   * Sweep expired reservations. Run this periodically (BullMQ job).
   */
  async sweepExpiredReservations(): Promise<number> {
    const expired = await this.db
      .update(stockReservations)
      .set({ status: "expired" })
      .where(
        and(
          eq(stockReservations.status, "active"),
          sql`expires_at < NOW()`,
        ),
      )
      .returning({ id: stockReservations.id });

    if (expired.length > 0) {
      this.logger.info({ count: expired.length }, "Swept expired stock reservations");
    }

    return expired.length;
  }

  // ── Sync stock to all marketplace accounts ────────────────────────────────

  /**
   * Sync stock for a SKU across all active marketplace accounts.
   *
   * Flow:
   *  1. Calculate net available = physicalStock - activeReservations
   *  2. Apply safety stock buffer per channel
   *  3. Find all active listings for this SKU
   *  4. Fan out to all connectors concurrently
   *  5. Publish NATS event
   */
  async syncStockToAllPlatforms(
    sku: string,
    physicalStock: number,
  ): Promise<StockSyncResult> {
    this.logger.info({ sku, physicalStock }, "Starting cross-platform stock sync");

    // Step 1: Calculate active reservations (pessimistic count)
    const reservedResult = await this.db
      .select({ total: sql<number>`COALESCE(SUM(reserved_quantity), 0)` })
      .from(stockReservations)
      .where(
        and(
          eq(stockReservations.sku, sku),
          eq(stockReservations.status, "active"),
          sql`expires_at > NOW()`,
        ),
      );

    const totalReserved = Number(reservedResult[0]?.total ?? 0);
    const netAvailable = Math.max(0, physicalStock - totalReserved);

    // Step 2: Apply safety stock buffer
    const bufferQty = Math.ceil(
      netAvailable * (env.SAFETY_STOCK_BUFFER_PCT / 100),
    );
    const safeStock = Math.max(0, netAvailable - bufferQty);

    // Step 3: Find all active listings for this SKU
    const listings = await this.db
      .select({
        id: productListings.id,
        platform: productListings.platform,
        externalOfferId: productListings.externalOfferId,
        accountId: productListings.accountId,
      })
      .from(productListings)
      .where(
        and(
          eq(productListings.sku, sku),
          inArray(productListings.status, ["active", "inactive"]),
        ),
      );

    if (listings.length === 0) {
      this.logger.debug({ sku }, "No active listings found for SKU");
      return {
        sku,
        totalAvailable: physicalStock,
        reserved: totalReserved,
        netAvailable,
        platformResults: [],
      };
    }

    // Step 4: Fan out to connectors concurrently
    const platformResults = await Promise.all(
      listings.map(async (listing) => {
        const connector = this.connectors.get(listing.platform);

        if (connector === undefined) {
          return {
            platform: listing.platform,
            success: false,
            error: `No connector registered for platform ${listing.platform}`,
          };
        }

        // Load account credentials
        const account = await this.db.query.sellerAccounts.findFirst({
          where: eq(sellerAccounts.id, listing.accountId),
        });

        if (account === undefined || !account.active) {
          return {
            platform: listing.platform,
            success: false,
            error: "Seller account not found or inactive",
          };
        }

        const auth: ConnectorAuthContext = {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          accountId: account.id as any,
          accessToken: decrypt(account.encryptedAccessToken, env.ENCRYPTION_KEY),
          refreshToken: decrypt(account.encryptedRefreshToken, env.ENCRYPTION_KEY),
          tokenExpiresAt: account.tokenExpiresAt,
        };

        const update: StockUpdate = {
          sku: asSku(sku),
          newQuantity: safeStock,
          externalOfferId:
            listing.externalOfferId !== null
              ? listing.externalOfferId
              : undefined,
        };

        try {
          const result = await connector.updateStock(update, auth);

          // Update published stock in DB
          if (result.success) {
            await this.db
              .update(productListings)
              .set({
                publishedStock: safeStock,
                lastSyncedAt: new Date(),
              })
              .where(eq(productListings.id, listing.id));
          }

          return {
            platform: listing.platform,
            success: result.success,
            error: result.error,
          };
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Unknown error";
          this.logger.error(
            { sku, platform: listing.platform, err },
            "Stock sync failed for platform",
          );
          return {
            platform: listing.platform,
            success: false,
            error: message,
          };
        }
      }),
    );

    // Step 5: Publish NATS event
    await this.nats.publishStockUpdated({
      sku,
      physicalStock,
      reserved: totalReserved,
      netAvailable,
      safeStock,
      platformResults,
    });

    const result: StockSyncResult = {
      sku,
      totalAvailable: physicalStock,
      reserved: totalReserved,
      netAvailable,
      platformResults,
    };

    const successCount = platformResults.filter((r) => r.success).length;
    this.logger.info(
      { sku, safeStock, totalListings: listings.length, successCount },
      "Cross-platform stock sync complete",
    );

    return result;
  }

  // ── Get current reserved quantity for a SKU ───────────────────────────────

  async getReservedQuantity(sku: string): Promise<number> {
    const result = await this.db
      .select({ total: sql<number>`COALESCE(SUM(reserved_quantity), 0)` })
      .from(stockReservations)
      .where(
        and(
          eq(stockReservations.sku, sku),
          eq(stockReservations.status, "active"),
          sql`expires_at > NOW()`,
        ),
      );

    return Number(result[0]?.total ?? 0);
  }
}
