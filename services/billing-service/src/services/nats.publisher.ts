// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — billing-service: NATS JetStream publisher
// Publishes billing domain events to the ECOMPILOT_EVENTS stream
// ─────────────────────────────────────────────────────────────────────────────

import {
  connect,
  type NatsConnection,
  type JetStreamClient,
  StringCodec,
  StorageType,
} from "nats";
import { JETSTREAM_CONFIG } from "@ecompilot/event-contracts";
import { env } from "../config/env.js";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// Billing event subjects (billing-service owns these subjects)
// ─────────────────────────────────────────────────────────────────────────────

export const BILLING_SUBJECTS = {
  SUBSCRIPTION_CREATED: "ecompilot.billing.subscription.created",
  SUBSCRIPTION_CANCELLED: "ecompilot.billing.subscription.cancelled",
  PAYMENT_FAILED: "ecompilot.billing.payment.failed",
} as const;

export type BillingSubject =
  (typeof BILLING_SUBJECTS)[keyof typeof BILLING_SUBJECTS];

// ─────────────────────────────────────────────────────────────────────────────
// Payload types
// ─────────────────────────────────────────────────────────────────────────────

export interface SubscriptionCreatedPayload {
  readonly userId: string;
  readonly stripeCustomerId: string;
  readonly stripeSubscriptionId: string;
  readonly plan: "free" | "pro" | "business";
  readonly interval: "monthly" | "yearly" | null;
  readonly status: "active" | "canceled" | "past_due" | "trialing";
  readonly currentPeriodStart: string; // ISO 8601
  readonly currentPeriodEnd: string; // ISO 8601
  readonly trialEnd: string | null; // ISO 8601
  readonly occurredAt: string; // ISO 8601
}

export interface SubscriptionCancelledPayload {
  readonly userId: string;
  readonly stripeCustomerId: string;
  readonly stripeSubscriptionId: string;
  readonly cancelledAt: string; // ISO 8601
  readonly occurredAt: string; // ISO 8601
}

export interface PaymentFailedPayload {
  readonly userId: string;
  readonly stripeCustomerId: string;
  readonly stripeInvoiceId: string;
  readonly stripeSubscriptionId: string | null;
  readonly amountCents: number;
  readonly currency: string;
  readonly failureReason: string | null;
  readonly failureCode: string | null;
  readonly attemptCount: number;
  readonly nextPaymentAttempt: string | null; // ISO 8601
  readonly occurredAt: string; // ISO 8601
}

// ─────────────────────────────────────────────────────────────────────────────
// Envelope
// ─────────────────────────────────────────────────────────────────────────────

interface BillingEventEnvelope<TPayload> {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly source: "billing-service";
  readonly schemaVersion: 1;
  readonly payload: TPayload;
}

function buildEnvelope<TPayload>(
  payload: TPayload,
): BillingEventEnvelope<TPayload> {
  return {
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    correlationId: crypto.randomUUID(),
    source: "billing-service",
    schemaVersion: 1,
    payload,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Publisher class
// ─────────────────────────────────────────────────────────────────────────────

export class NatsPublisher {
  private _nc: NatsConnection | null = null;
  private _js: JetStreamClient | null = null;
  private readonly _codec = StringCodec();
  private readonly _logger: Logger;

  constructor(logger: Logger) {
    this._logger = logger;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    this._nc = await connect({ servers: env.NATS_URL });
    this._js = this._nc.jetstream();

    this._logger.info(
      { url: env.NATS_URL },
      "Connected to NATS JetStream",
    );

    // Ensure the shared stream exists (idempotent)
    const jsm = await this._nc.jetstreamManager();
    try {
      await jsm.streams.info(JETSTREAM_CONFIG.streamName);
    } catch {
      // Stream does not exist — create it with billing subjects appended
      const allSubjects = [
        ...JETSTREAM_CONFIG.subjects,
        ...Object.values(BILLING_SUBJECTS),
      ];
      await jsm.streams.add({
        name: JETSTREAM_CONFIG.streamName,
        subjects: allSubjects,
        max_age: JETSTREAM_CONFIG.maxAge,
        max_msg_size: JETSTREAM_CONFIG.maxMsgSize,
        storage: StorageType.File,
        num_replicas: JETSTREAM_CONFIG.replicas,
      });
      this._logger.info(
        { stream: JETSTREAM_CONFIG.streamName },
        "JetStream stream created",
      );
    }
  }

  async close(): Promise<void> {
    if (this._nc !== null) {
      await this._nc.drain();
      this._nc = null;
      this._js = null;
      this._logger.info("NATS connection drained and closed");
    }
  }

  // ── Internal publish helper ────────────────────────────────────────────────

  private async publish<TPayload>(
    subject: BillingSubject,
    payload: TPayload,
  ): Promise<void> {
    if (this._js === null) {
      throw new Error("NatsPublisher not connected. Call connect() first.");
    }

    const envelope = buildEnvelope(payload);
    const data = this._codec.encode(JSON.stringify(envelope));

    await this._js.publish(subject, data, {
      // Dedup window — JetStream MsgId for exactly-once semantics
      msgID: envelope.eventId,
    });

    this._logger.info(
      { subject, eventId: envelope.eventId },
      "NATS event published",
    );
  }

  // ── Public publisher methods ───────────────────────────────────────────────

  async publishSubscriptionCreated(
    payload: SubscriptionCreatedPayload,
  ): Promise<void> {
    await this.publish(BILLING_SUBJECTS.SUBSCRIPTION_CREATED, payload);
  }

  async publishSubscriptionCancelled(
    payload: SubscriptionCancelledPayload,
  ): Promise<void> {
    await this.publish(BILLING_SUBJECTS.SUBSCRIPTION_CANCELLED, payload);
  }

  async publishPaymentFailed(
    payload: PaymentFailedPayload,
  ): Promise<void> {
    await this.publish(BILLING_SUBJECTS.PAYMENT_FAILED, payload);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton — initialized in bootstrap, injected into route context
// ─────────────────────────────────────────────────────────────────────────────

let _publisher: NatsPublisher | null = null;

export function initNatsPublisher(logger: Logger): NatsPublisher {
  if (_publisher !== null) return _publisher;
  _publisher = new NatsPublisher(logger);
  return _publisher;
}

export function getNatsPublisher(): NatsPublisher {
  if (_publisher === null) {
    throw new Error(
      "NatsPublisher not initialized. Call initNatsPublisher() first.",
    );
  }
  return _publisher;
}
