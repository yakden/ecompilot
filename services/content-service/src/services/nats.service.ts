// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — content-service
// NATS JetStream publisher for content generation events
// ─────────────────────────────────────────────────────────────────────────────

import { connect, type NatsConnection, StringCodec } from "nats";
import {
  SUBJECTS,
  ContentGenerationCompleteEventSchema,
} from "@ecompilot/event-contracts";
import type { ContentGenerationCompleteEvent } from "@ecompilot/event-contracts";
import { env } from "../config/env.js";
import { createLogger } from "@ecompilot/shared-observability";
import type { UserId } from "@ecompilot/shared-types";

const logger = createLogger({ service: "content-service" });
const sc = StringCodec();

// ─────────────────────────────────────────────────────────────────────────────
// Connection singleton
// ─────────────────────────────────────────────────────────────────────────────

let _nc: NatsConnection | null = null;

export async function getNatsConnection(): Promise<NatsConnection> {
  if (_nc !== null && !_nc.isClosed()) return _nc;

  _nc = await connect({
    servers: env.NATS_URL,
    name: "content-service",
    reconnect: true,
    maxReconnectAttempts: -1,
    reconnectTimeWait: 2_000,
  });

  logger.info({ natsUrl: env.NATS_URL }, "NATS connection established");
  return _nc;
}

export async function closeNatsConnection(): Promise<void> {
  if (_nc !== null) {
    await _nc.drain();
    _nc = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// publishContentGenerationComplete
// ─────────────────────────────────────────────────────────────────────────────

export interface ContentCompletedPayload {
  readonly generationId: string;
  readonly userId: UserId;
  readonly organizationId: string | null;
  readonly contentType: ContentGenerationCompleteEvent["payload"]["contentType"];
  readonly marketplace: ContentGenerationCompleteEvent["payload"]["marketplace"];
  readonly language: ContentGenerationCompleteEvent["payload"]["language"];
  readonly tokenCount: number | null;
  readonly modelUsed: string;
  readonly processingTimeMs: number;
  readonly contentStorageKey: string;
}

export async function publishContentGenerationComplete(
  payload: ContentCompletedPayload,
): Promise<void> {
  try {
    const nc = await getNatsConnection();
    const js = nc.jetstream();

    const now = new Date().toISOString();

    const event = ContentGenerationCompleteEventSchema.parse({
      eventId: crypto.randomUUID(),
      occurredAt: now,
      correlationId: crypto.randomUUID(),
      source: "content-service",
      schemaVersion: 1,
      type: "content.generation.complete",
      payload: {
        generationId: payload.generationId,
        userId: payload.userId,
        // organizationId brand is the same underlying string UUID; Zod parses it
        organizationId: payload.organizationId,
        contentType: payload.contentType,
        marketplace: payload.marketplace,
        language: payload.language,
        tokenCount: payload.tokenCount,
        modelUsed: payload.modelUsed,
        processingTimeMs: payload.processingTimeMs,
        completedAt: now,
        contentStorageKey: payload.contentStorageKey,
      },
    });

    await js.publish(
      SUBJECTS.CONTENT_GENERATION_COMPLETE,
      sc.encode(JSON.stringify(event)),
    );

    logger.info(
      { generationId: payload.generationId, subject: SUBJECTS.CONTENT_GENERATION_COMPLETE },
      "Published content.generation.complete event",
    );
  } catch (err) {
    // Non-fatal — job result is already in DB; event publish failure should not
    // surface as a job failure.
    logger.error({ err }, "Failed to publish NATS content generation event");
  }
}
