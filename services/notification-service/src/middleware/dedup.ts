// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — notification-service: Redis deduplication middleware
//
// Key pattern: notif:dedup:{userId}:{subject}:{hourBucket}
// TTL: 3600s  |  SET NX — prevents duplicate notifications within 1 hour
// ─────────────────────────────────────────────────────────────────────────────

import { getRedis } from "../services/redis.service.js";
import type { Logger } from "pino";

const DEDUP_TTL_SECONDS = 3_600;
const KEY_PREFIX = "notif:dedup" as const;

// ─────────────────────────────────────────────────────────────────────────────
// Hour bucket — floor(unix timestamp / 3600)
// ─────────────────────────────────────────────────────────────────────────────

function hourBucket(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1_000 / 3_600);
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the dedup cache key
// ─────────────────────────────────────────────────────────────────────────────

export function buildDedupKey(userId: string, subject: string, now?: Date): string {
  return `${KEY_PREFIX}:${userId}:${subject}:${hourBucket(now)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// isDuplicate
//
// Returns true if the notification was already sent in the current hour bucket.
// Uses SET NX EX so the first caller "wins" and subsequent ones are deduplicated.
// ─────────────────────────────────────────────────────────────────────────────

export async function isDuplicate(
  userId: string,
  subject: string,
  logger: Logger,
): Promise<boolean> {
  const redis = getRedis();
  const key = buildDedupKey(userId, subject);

  // SET NX returns null when the key already exists (duplicate)
  const result = await redis.set(key, "1", {
    NX: true,
    EX: DEDUP_TTL_SECONDS,
  });

  const duplicate = result === null;

  if (duplicate) {
    logger.debug({ userId, subject, key }, "Dedup: duplicate notification suppressed");
  }

  return duplicate;
}

// ─────────────────────────────────────────────────────────────────────────────
// clearDedup — useful for testing or forced re-delivery
// ─────────────────────────────────────────────────────────────────────────────

export async function clearDedup(userId: string, subject: string): Promise<void> {
  const redis = getRedis();
  const key = buildDedupKey(userId, subject);
  await redis.del(key);
}
