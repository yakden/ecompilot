// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — notification-service: NATS JetStream subscriber client
// ─────────────────────────────────────────────────────────────────────────────

import {
  connect,
  StringCodec,
  type NatsConnection,
  type JetStreamClient,
  type JetStreamManager,
  type ConsumerConfig,
  AckPolicy,
  DeliverPolicy,
} from "nats";
import { env } from "../config/env.js";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// NATS singleton
// ─────────────────────────────────────────────────────────────────────────────

let _nc: NatsConnection | null = null;
let _js: JetStreamClient | null = null;
let _jsm: JetStreamManager | null = null;

export const sc = StringCodec();

export async function connectNats(logger: Logger): Promise<void> {
  if (_nc !== null) return;

  _nc = await connect({ servers: env.NATS_URL });
  _js = _nc.jetstream();
  _jsm = await _nc.jetstreamManager();

  logger.info({ url: env.NATS_URL }, "Connected to NATS JetStream");

  // Log status changes — reconnection is handled automatically
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
    _jsm = null;
    logger.info("NATS connection closed");
  }
}

export function getJetStream(): JetStreamClient {
  if (_js === null) {
    throw new Error("NATS JetStream not initialized. Call connectNats() first.");
  }
  return _js;
}

export function getJetStreamManager(): JetStreamManager {
  if (_jsm === null) {
    throw new Error("NATS JetStream manager not initialized. Call connectNats() first.");
  }
  return _jsm;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ensure a durable push consumer exists for a given subject
// ─────────────────────────────────────────────────────────────────────────────

export async function ensureConsumer(
  streamName: string,
  consumerName: string,
  filterSubject: string,
  logger: Logger,
): Promise<void> {
  const jsm = getJetStreamManager();

  const config: Partial<ConsumerConfig> = {
    name: consumerName,
    durable_name: consumerName,
    filter_subject: filterSubject,
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    max_deliver: 5,
    ack_wait: 30_000_000_000, // 30s in nanoseconds
  };

  try {
    await jsm.consumers.info(streamName, consumerName);
    logger.debug({ streamName, consumerName }, "NATS consumer already exists");
  } catch {
    await jsm.consumers.add(streamName, config as ConsumerConfig);
    logger.info({ streamName, consumerName, filterSubject }, "NATS consumer created");
  }
}
