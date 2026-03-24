// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — logistics-engine
// BullMQ tracking worker
//
// Polls InPost public tracking endpoint at adaptive intervals:
//   - "in_transit"        → every 30 minutes
//   - "out_for_delivery"  → every 10 minutes
//   - terminal statuses   → no re-schedule (stop polling)
//
// On each poll:
//   1. Fetch tracking events from carrier
//   2. Persist new events to tracking_events table
//   3. Update shipment.status if changed
//   4. Publish NATS: logistics.tracking.updated
//   5. Re-schedule job at appropriate interval (or remove if delivered)
// ─────────────────────────────────────────────────────────────────────────────

import { Worker, Queue, type Job, type ConnectionOptions } from "bullmq";
import { connect, type NatsConnection, StringCodec } from "nats";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import pg from "pg";
import type { Logger } from "pino";
import { z } from "zod";
import { shipments, trackingEvents } from "../db/schema.js";
import type { InPostConnector } from "../connectors/inpost.connector.js";
import type { NormalisedShipmentStatus, TrackingNumber } from "../types/carrier.js";
import { asTrackingNumber } from "../types/carrier.js";
import * as schema from "../db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Job payload schema
// ─────────────────────────────────────────────────────────────────────────────

const TrackingJobDataSchema = z.object({
  shipmentId: z.string().uuid(),
  trackingNumber: z.string().min(1),
  carrier: z.enum(["inpost", "dpd", "dhl_domestic", "dhl_express", "orlen", "gls", "poczta_polska"]),
  orderId: z.string().uuid(),
  userId: z.string().uuid(),
});

export type TrackingJobData = z.infer<typeof TrackingJobDataSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Queue name constants
// ─────────────────────────────────────────────────────────────────────────────

export const TRACKING_QUEUE_NAME = "logistics-tracking" as const;

// ─────────────────────────────────────────────────────────────────────────────
// Terminal statuses — no further polling after reaching these
// ─────────────────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set<NormalisedShipmentStatus>([
  "delivered",
  "returned",
  "cancelled",
  "exception",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Poll interval by status
// ─────────────────────────────────────────────────────────────────────────────

function getPollIntervalMs(status: NormalisedShipmentStatus): number {
  switch (status) {
    case "out_for_delivery":
      return 10 * 60 * 1_000; // 10 min
    case "in_transit":
    case "picked_up":
      return 30 * 60 * 1_000; // 30 min
    case "ready_for_pickup":
      return 15 * 60 * 1_000; // 15 min
    case "failed_delivery":
      return 60 * 60 * 1_000; // 1 hour
    default:
      return 30 * 60 * 1_000; // 30 min default
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NATS subject
// ─────────────────────────────────────────────────────────────────────────────

const NATS_SUBJECTS = {
  TRACKING_UPDATED: "logistics.tracking.updated",
  SHIPMENT_DELIVERED: "logistics.shipment.delivered",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Tracking worker options
// ─────────────────────────────────────────────────────────────────────────────

export interface TrackingWorkerOptions {
  readonly redisUrl: string;
  readonly databaseUrl: string;
  readonly natsUrl: string;
  readonly inpostConnector: InPostConnector;
  readonly logger: Logger;
  readonly concurrency?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue factory — creates a Queue instance for enqueuing tracking jobs
// ─────────────────────────────────────────────────────────────────────────────

export function createTrackingQueue(redisUrl: string): Queue<TrackingJobData> {
  const url = new URL(redisUrl);
  const connection: ConnectionOptions = {
    host: url.hostname,
    port: Number(url.port) || 6379,
    ...(url.password.length > 0 && { password: url.password }),
    ...(url.protocol === "rediss:" && { tls: {} }),
  };
  return new Queue<TrackingJobData>(TRACKING_QUEUE_NAME, { connection });
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker class
// ─────────────────────────────────────────────────────────────────────────────

export class TrackingWorker {
  private readonly worker: Worker<TrackingJobData>;
  private readonly queue: Queue<TrackingJobData>;
  private readonly db: NodePgDatabase<typeof schema>;
  private nats: NatsConnection | null = null;
  private readonly sc = StringCodec();
  private readonly logger: Logger;
  private readonly inpostConnector: InPostConnector;

  constructor(options: TrackingWorkerOptions) {
    this.logger = options.logger.child({ component: "tracking-worker" });
    this.inpostConnector = options.inpostConnector;

    // ── Database ───────────────────────────────────────────────────────────
    const pool = new pg.Pool({ connectionString: options.databaseUrl, max: 5 });
    this.db = drizzle(pool, { schema }) as NodePgDatabase<typeof schema>;

    // ── BullMQ connection ──────────────────────────────────────────────────
    const redisUrl = new URL(options.redisUrl);
    const connection: ConnectionOptions = {
      host: redisUrl.hostname,
      port: Number(redisUrl.port) || 6379,
      ...(redisUrl.password.length > 0 && { password: redisUrl.password }),
      ...(redisUrl.protocol === "rediss:" && { tls: {} }),
    };

    this.queue = new Queue<TrackingJobData>(TRACKING_QUEUE_NAME, { connection });

    this.worker = new Worker<TrackingJobData>(
      TRACKING_QUEUE_NAME,
      (job: Job<TrackingJobData>) => this.processJob(job),
      {
        connection,
        concurrency: options.concurrency ?? 5,
        // Exponential backoff on job-level failures
        settings: {
          backoffStrategy: (attemptsMade: number) =>
            Math.min(1_000 * 2 ** attemptsMade, 5 * 60_000),
        },
      },
    );

    this.worker.on("failed", (job: { id?: string; data: TrackingJobData } | undefined, err: unknown) => {
      this.logger.error(
        { jobId: job?.id, shipmentId: job?.data.shipmentId, err },
        "Tracking job failed",
      );
    });

    this.worker.on("error", (err: unknown) => {
      this.logger.error({ err }, "BullMQ worker error");
    });

    // ── NATS connection (lazy — connect on first use) ───────────────────────
    connect({ servers: options.natsUrl })
      .then((nc: NatsConnection) => {
        this.nats = nc;
        this.logger.info("NATS connection established in tracking worker");
      })
      .catch((err: unknown) => {
        this.logger.error({ err }, "Failed to connect to NATS in tracking worker");
      });
  }

  // ── Job processor ──────────────────────────────────────────────────────────

  private async processJob(job: Job<TrackingJobData>): Promise<void> {
    const parsed = TrackingJobDataSchema.safeParse(job.data);
    if (!parsed.success) {
      this.logger.warn(
        { jobId: job.id, errors: parsed.error.errors },
        "Invalid tracking job data — discarding",
      );
      return;
    }

    const { shipmentId, trackingNumber, carrier, orderId, userId } = parsed.data;

    this.logger.debug({ shipmentId, trackingNumber, carrier }, "Processing tracking job");

    // Only InPost is fully implemented — route accordingly
    if (carrier !== "inpost") {
      this.logger.debug(
        { carrier, shipmentId },
        "Carrier not yet supported for tracking polling — skipping",
      );
      return;
    }

    // ── Fetch current tracking from carrier ────────────────────────────────
    let trackingResult: Awaited<ReturnType<InPostConnector["getTracking"]>>;
    try {
      trackingResult = await this.inpostConnector.getTracking(
        asTrackingNumber(trackingNumber),
      );
    } catch (err: unknown) {
      this.logger.warn(
        { shipmentId, trackingNumber, err },
        "Tracking poll failed — will retry",
      );
      throw err; // BullMQ will re-schedule with backoff
    }

    const { currentStatus, events } = trackingResult;

    // ── Persist new tracking events (idempotent via unique constraint) ──────
    const newEvents = events.filter((e) => e.occurredAt !== undefined);

    if (newEvents.length > 0) {
      // Fetch already-stored rawStatuses for this tracking number to avoid re-insert
      const existingRawStatuses = await this.db
        .select({ rawStatus: trackingEvents.rawStatus, occurredAt: trackingEvents.occurredAt })
        .from(trackingEvents)
        .where(eq(trackingEvents.trackingNumber, trackingNumber));

      const existingKeys = new Set(
        existingRawStatuses.map((r) => `${r.rawStatus}__${r.occurredAt.toISOString()}`),
      );

      const toInsert = newEvents.filter(
        (e) => !existingKeys.has(`${e.rawStatus}__${e.occurredAt}`),
      );

      if (toInsert.length > 0) {
        await this.db.insert(trackingEvents).values(
          toInsert.map((event) => ({
            shipmentId,
            trackingNumber,
            carrier: carrier as typeof trackingEvents.$inferInsert["carrier"],
            status: event.status as typeof trackingEvents.$inferInsert["status"],
            rawStatus: event.rawStatus,
            occurredAt: new Date(event.occurredAt),
            location: event.location ?? null,
            description: event.description ?? null,
            attributes: event.attributes ?? null,
          })),
        ).onConflictDoNothing();
      }
    }

    // ── Update shipment status if changed ──────────────────────────────────
    const [currentShipment] = await this.db
      .select({ status: shipments.status })
      .from(shipments)
      .where(eq(shipments.id, shipmentId))
      .limit(1);

    if (currentShipment !== undefined && currentShipment.status !== currentStatus) {
      const isTerminal = TERMINAL_STATUSES.has(currentStatus);
      await this.db
        .update(shipments)
        .set({
          status: currentStatus as typeof shipments.$inferSelect["status"],
          updatedAt: new Date(),
          ...(isTerminal && { completedAt: new Date() }),
        })
        .where(eq(shipments.id, shipmentId));

      this.logger.info(
        {
          shipmentId,
          trackingNumber,
          previousStatus: currentShipment.status,
          newStatus: currentStatus,
        },
        "Shipment status updated",
      );
    }

    // ── Publish NATS event ─────────────────────────────────────────────────
    await this.publishTrackingUpdated({
      shipmentId,
      orderId,
      userId,
      trackingNumber,
      carrier,
      currentStatus,
      lastCheckedAt: trackingResult.lastCheckedAt,
    });

    // Publish delivered event
    if (currentStatus === "delivered") {
      await this.publishShipmentDelivered({ shipmentId, orderId, userId, trackingNumber, carrier });
    }

    // ── Re-schedule or stop ────────────────────────────────────────────────
    if (TERMINAL_STATUSES.has(currentStatus)) {
      this.logger.info(
        { shipmentId, trackingNumber, status: currentStatus },
        "Shipment reached terminal status — stopping tracking poll",
      );
      return; // Do not re-schedule
    }

    const delayMs = getPollIntervalMs(currentStatus);
    await this.queue.add(
      "poll",
      parsed.data,
      {
        delay: delayMs,
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        jobId: `track:${trackingNumber}`, // Deduplicate: only one job per tracking number
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 20 },
      },
    );

    this.logger.debug(
      {
        shipmentId,
        trackingNumber,
        status: currentStatus,
        nextPollInMs: delayMs,
      },
      "Tracking job re-scheduled",
    );
  }

  // ── NATS publishing ────────────────────────────────────────────────────────

  private async publishTrackingUpdated(payload: {
    shipmentId: string;
    orderId: string;
    userId: string;
    trackingNumber: string;
    carrier: string;
    currentStatus: NormalisedShipmentStatus;
    lastCheckedAt: string;
  }): Promise<void> {
    if (this.nats === null) return;
    try {
      const message = JSON.stringify({
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        source: "logistics-engine",
        type: "logistics.tracking.updated",
        payload,
      });
      this.nats.publish(
        NATS_SUBJECTS.TRACKING_UPDATED,
        this.sc.encode(message),
      );
    } catch (err: unknown) {
      this.logger.warn({ err }, "Failed to publish NATS tracking.updated event");
    }
  }

  private async publishShipmentDelivered(payload: {
    shipmentId: string;
    orderId: string;
    userId: string;
    trackingNumber: string;
    carrier: string;
  }): Promise<void> {
    if (this.nats === null) return;
    try {
      const message = JSON.stringify({
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        source: "logistics-engine",
        type: "logistics.shipment.delivered",
        payload: { ...payload, deliveredAt: new Date().toISOString() },
      });
      this.nats.publish(
        NATS_SUBJECTS.SHIPMENT_DELIVERED,
        this.sc.encode(message),
      );
    } catch (err: unknown) {
      this.logger.warn({ err }, "Failed to publish NATS shipment.delivered event");
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    if (this.nats !== null) {
      await this.nats.drain();
    }
    this.logger.info("Tracking worker shut down");
  }

  /**
   * Enqueue a new tracking job.
   * Uses the tracking number as deduplication key so only one
   * active job exists per shipment.
   */
  async enqueueTrackingJob(
    data: TrackingJobData,
    initialDelayMs = 0,
  ): Promise<void> {
    await this.queue.add("poll", data, {
      delay: initialDelayMs,
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      jobId: `track:${data.trackingNumber}`,
      removeOnComplete: { count: 5 },
      removeOnFail: { count: 20 },
    });
    this.logger.info(
      { trackingNumber: data.trackingNumber, shipmentId: data.shipmentId },
      "Tracking job enqueued",
    );
  }
}
