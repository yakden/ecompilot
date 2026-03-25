// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — marketplace-hub: NATS JetStream publisher
// Publishes marketplace domain events to the ECOMPILOT_EVENTS stream
// ─────────────────────────────────────────────────────────────────────────────

import {
  connect,
  type NatsConnection,
  type JetStreamClient,
  StringCodec,
} from "nats";
import {
  SUBJECTS,
  type MarketplaceOrderCreatedEvent,
  type MarketplaceOrderStatusChangedEvent,
} from "@ecompilot/event-contracts";
import { env } from "../config/env.js";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace-hub NATS subjects (extends base contract subjects)
// ─────────────────────────────────────────────────────────────────────────────

export const MARKETPLACE_SUBJECTS = {
  ...SUBJECTS,
  MARKETPLACE_STOCK_UPDATED: "ecompilot.marketplace.stock.updated",
  MARKETPLACE_OFFER_PUBLISHED: "ecompilot.marketplace.offer.published",
  MARKETPLACE_OFFER_DEACTIVATED: "ecompilot.marketplace.offer.deactivated",
  MARKETPLACE_TOKEN_REFRESHED: "ecompilot.marketplace.account.token_refreshed",
  MARKETPLACE_ACCOUNT_CONNECTED: "ecompilot.marketplace.account.connected",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Payload types for marketplace-hub specific events
// ─────────────────────────────────────────────────────────────────────────────

export interface StockUpdatedPayload {
  readonly sku: string;
  readonly physicalStock: number;
  readonly reserved: number;
  readonly netAvailable: number;
  readonly safeStock: number;
  readonly platformResults: ReadonlyArray<{
    readonly platform: string;
    readonly success: boolean;
    readonly error: string | undefined;
  }>;
}

export interface OfferPublishedPayload {
  readonly sku: string;
  readonly platform: string;
  readonly externalOfferId: string;
  readonly listingUrl: string | null;
  readonly accountId: string;
}

export interface OfferDeactivatedPayload {
  readonly sku: string;
  readonly platform: string;
  readonly externalOfferId: string;
  readonly accountId: string;
  readonly reason?: string;
}

export interface AccountConnectedPayload {
  readonly accountId: string;
  readonly userId: string;
  readonly platform: string;
  readonly platformUserId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event envelope builder
// ─────────────────────────────────────────────────────────────────────────────

interface EventEnvelope<TPayload> {
  readonly eventId: string;
  readonly type: string;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly source: "marketplace-hub";
  readonly schemaVersion: 1;
  readonly payload: TPayload;
}

function buildEnvelope<TPayload>(
  type: string,
  payload: TPayload,
): EventEnvelope<TPayload> {
  return {
    eventId: crypto.randomUUID(),
    type,
    occurredAt: new Date().toISOString(),
    correlationId: crypto.randomUUID(),
    source: "marketplace-hub",
    schemaVersion: 1,
    payload,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NatsPublisher
// ─────────────────────────────────────────────────────────────────────────────

export class NatsPublisher {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private readonly sc = StringCodec();

  constructor(private readonly logger: Logger) {}

  async connect(): Promise<void> {
    if (this.nc !== null) return;

    this.nc = await connect({ servers: env.NATS_URL });
    this.js = this.nc.jetstream();

    this.logger.info({ url: env.NATS_URL }, "Connected to NATS JetStream");

    // Monitor connection status
    void (async () => {
      for await (const status of this.nc!.status()) {
        if (status.type === "pingTimer") {
          this.logger.debug({ status: status.type, data: status.data }, "NATS status change");
        } else {
          this.logger.warn({ status: status.type, data: status.data }, "NATS status change");
        }
      }
    })();
  }

  async close(): Promise<void> {
    if (this.nc !== null) {
      await this.nc.drain();
      this.nc = null;
      this.js = null;
      this.logger.info("NATS connection closed");
    }
  }

  private getJetStream(): JetStreamClient {
    if (this.js === null) {
      throw new Error(
        "NATS JetStream not initialized. Call connect() first.",
      );
    }
    return this.js;
  }

  private async publish<T>(subject: string, payload: T): Promise<void> {
    const js = this.getJetStream();
    const envelope = buildEnvelope(subject, payload);
    const encoded = this.sc.encode(JSON.stringify(envelope));

    try {
      const ack = await js.publish(subject, encoded);
      this.logger.debug(
        { subject, seq: ack.seq, eventId: envelope.eventId },
        "NATS event published",
      );
    } catch (err) {
      this.logger.error(
        { err, subject, eventId: envelope.eventId },
        "Failed to publish NATS event",
      );
      throw err;
    }
  }

  // ── Marketplace event publishers ─────────────────────────────────────────

  async publishOrderCreated(
    event: MarketplaceOrderCreatedEvent,
  ): Promise<void> {
    await this.publish(SUBJECTS.MARKETPLACE_ORDER_CREATED, event);
  }

  async publishOrderStatusChanged(
    event: MarketplaceOrderStatusChangedEvent,
  ): Promise<void> {
    await this.publish(SUBJECTS.MARKETPLACE_ORDER_STATUS_CHANGED, event);
  }

  async publishStockUpdated(payload: StockUpdatedPayload): Promise<void> {
    await this.publish(
      MARKETPLACE_SUBJECTS.MARKETPLACE_STOCK_UPDATED,
      payload,
    );
  }

  async publishOfferPublished(payload: OfferPublishedPayload): Promise<void> {
    await this.publish(
      MARKETPLACE_SUBJECTS.MARKETPLACE_OFFER_PUBLISHED,
      payload,
    );
  }

  async publishOfferDeactivated(
    payload: OfferDeactivatedPayload,
  ): Promise<void> {
    await this.publish(
      MARKETPLACE_SUBJECTS.MARKETPLACE_OFFER_DEACTIVATED,
      payload,
    );
  }

  async publishAccountConnected(
    payload: AccountConnectedPayload,
  ): Promise<void> {
    await this.publish(
      MARKETPLACE_SUBJECTS.MARKETPLACE_ACCOUNT_CONNECTED,
      payload,
    );
  }
}
