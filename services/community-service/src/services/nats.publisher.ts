// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — community-service: NATS JetStream publisher
// Publishes community domain events to the ECOMPILOT_EVENTS stream
// ─────────────────────────────────────────────────────────────────────────────

import {
  connect,
  StorageType,
  type NatsConnection,
  type JetStreamClient,
  StringCodec,
} from "nats";
import { JETSTREAM_CONFIG, SUBJECTS } from "@ecompilot/event-contracts";
import { env } from "../config/env.js";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// Community event subjects (community-service owns these subjects)
// ─────────────────────────────────────────────────────────────────────────────

export const COMMUNITY_SUBJECTS = {
  POST_REPLY_CREATED: SUBJECTS.COMMUNITY_NEW_REPLY,
} as const satisfies Record<string, string>;

export type CommunitySubject =
  (typeof COMMUNITY_SUBJECTS)[keyof typeof COMMUNITY_SUBJECTS];

// ─────────────────────────────────────────────────────────────────────────────
// Payload types (aligned with event-contracts CommunityNewReplyEvent payload)
// ─────────────────────────────────────────────────────────────────────────────

export interface CommunityReplyCreatedPayload {
  readonly replyId: string;
  readonly postId: string;
  /** threadId === postId for top-level discussions */
  readonly threadId: string;
  readonly authorId: string;
  readonly recipientId: string;
  readonly preview: string;
  readonly createdAt: string;
  readonly notifyEmail: boolean;
  readonly notifyPush: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Envelope
// ─────────────────────────────────────────────────────────────────────────────

interface CommunityEventEnvelope<TPayload> {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly source: "community-service";
  readonly type: "community.reply.created";
  readonly schemaVersion: 1;
  readonly payload: TPayload;
}

function buildEnvelope<TPayload>(
  type: "community.reply.created",
  payload: TPayload,
): CommunityEventEnvelope<TPayload> {
  return {
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    correlationId: crypto.randomUUID(),
    source: "community-service",
    type,
    schemaVersion: 1,
    payload,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Publisher class
// ─────────────────────────────────────────────────────────────────────────────

export class CommunityNatsPublisher {
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

    // Ensure the shared ECOMPILOT_EVENTS stream includes community subjects
    const jsm = await this._nc.jetstreamManager();
    try {
      await jsm.streams.info(JETSTREAM_CONFIG.streamName);
    } catch {
      // Stream does not exist — create it
      await jsm.streams.add({
        name: JETSTREAM_CONFIG.streamName,
        subjects: [...JETSTREAM_CONFIG.subjects],
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

    // Monitor status changes
    void (async () => {
      for await (const status of this._nc!.status()) {
        if (status.type === "pingTimer") {
          this._logger.debug({ status: status.type, data: status.data }, "NATS status change");
        } else {
          this._logger.warn({ status: status.type, data: status.data }, "NATS status change");
        }
      }
    })();
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
    subject: CommunitySubject,
    type: "community.reply.created",
    payload: TPayload,
  ): Promise<void> {
    if (this._js === null) {
      throw new Error(
        "CommunityNatsPublisher not connected. Call connect() first.",
      );
    }

    const envelope = buildEnvelope(type, payload);
    const data = this._codec.encode(JSON.stringify(envelope));

    await this._js.publish(subject, data, {
      msgID: envelope.eventId,
    });

    this._logger.info(
      { subject, eventId: envelope.eventId },
      "NATS community event published",
    );
  }

  // ── Public publisher methods ───────────────────────────────────────────────

  async publishReplyCreated(
    payload: CommunityReplyCreatedPayload,
  ): Promise<void> {
    await this.publish(
      COMMUNITY_SUBJECTS.POST_REPLY_CREATED,
      "community.reply.created",
      payload,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

let _publisher: CommunityNatsPublisher | null = null;

export function initNatsPublisher(logger: Logger): CommunityNatsPublisher {
  if (_publisher !== null) return _publisher;
  _publisher = new CommunityNatsPublisher(logger);
  return _publisher;
}

export function getNatsPublisher(): CommunityNatsPublisher {
  if (_publisher === null) {
    throw new Error(
      "CommunityNatsPublisher not initialized. Call initNatsPublisher() first.",
    );
  }
  return _publisher;
}
