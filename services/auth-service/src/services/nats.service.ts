// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — auth-service: NATS JetStream publisher
// ─────────────────────────────────────────────────────────────────────────────

import { connect, type NatsConnection, type JetStreamClient, StringCodec } from "nats";
import { env } from "../config/env.js";
import { SUBJECTS, type UserRegisteredEvent } from "@ecompilot/event-contracts";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// NATS singleton
// ─────────────────────────────────────────────────────────────────────────────

let _nc: NatsConnection | null = null;
let _js: JetStreamClient | null = null;
const sc = StringCodec();

export async function connectNats(logger: Logger): Promise<void> {
  if (_nc !== null) return;

  _nc = await connect({ servers: env.NATS_URL });
  _js = _nc.jetstream();

  logger.info({ url: env.NATS_URL }, "Connected to NATS JetStream");

  // Log disconnect warnings — reconnection is automatic
  void (async () => {
    for await (const status of _nc!.status()) {
      logger.warn({ status: status.type, data: status.data }, "NATS status change");
    }
  })();
}

export async function closeNats(logger: Logger): Promise<void> {
  if (_nc !== null) {
    await _nc.drain();
    _nc = null;
    _js = null;
    logger.info("NATS connection closed");
  }
}

function getJetStream(): JetStreamClient {
  if (_js === null) {
    throw new Error("NATS JetStream not initialized. Call connectNats() first.");
  }
  return _js;
}

// ─────────────────────────────────────────────────────────────────────────────
// Publish helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function publishUserRegistered(
  event: UserRegisteredEvent,
  logger: Logger,
): Promise<void> {
  const js = getJetStream();
  const subject = SUBJECTS.USER_REGISTERED;
  const payload = sc.encode(JSON.stringify(event));

  try {
    const ack = await js.publish(subject, payload);
    logger.info(
      { subject, seq: ack.seq, eventId: event.eventId, userId: event.payload.userId },
      "Published user.registered event",
    );
  } catch (err) {
    logger.error(
      { err, subject, eventId: event.eventId },
      "Failed to publish user.registered event",
    );
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic typed publish — used for future event types
// ─────────────────────────────────────────────────────────────────────────────

export async function publishEvent(
  subject: string,
  event: Record<string, unknown>,
  logger: Logger,
): Promise<void> {
  const js = getJetStream();
  const payload = sc.encode(JSON.stringify(event));

  try {
    const ack = await js.publish(subject, payload);
    logger.info({ subject, seq: ack.seq }, "Published NATS event");
  } catch (err) {
    logger.error({ err, subject }, "Failed to publish NATS event");
    throw err;
  }
}
