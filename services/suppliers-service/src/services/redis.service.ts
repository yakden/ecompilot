// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — suppliers-service: Redis client
// Singleton redis client for caching external registry lookups (KRS, CEIDG, REGON).
// Uses the same node-redis v4 pattern as auth-service.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "redis";
import { env } from "../config/env.js";
import type { Logger } from "pino";

type RedisClient = ReturnType<typeof createClient>;

let _redis: RedisClient | null = null;

export async function connectRedis(logger: Logger): Promise<RedisClient> {
  if (_redis !== null) return _redis;

  const client = createClient({ url: env.REDIS_URL });

  client.on("error", (err: unknown) => {
    logger.error({ err }, "Redis client error");
  });

  client.on("reconnecting", () => {
    logger.warn("Redis reconnecting");
  });

  await client.connect();
  _redis = client;

  logger.info({ url: env.REDIS_URL }, "Connected to Redis (suppliers-service)");
  return _redis;
}

export async function closeRedis(logger: Logger): Promise<void> {
  if (_redis !== null) {
    await _redis.quit();
    _redis = null;
    logger.info("Redis connection closed (suppliers-service)");
  }
}

export function getRedis(): RedisClient {
  if (_redis === null) {
    throw new Error(
      "Redis not initialized. Call connectRedis() first in bootstrap.",
    );
  }
  return _redis;
}
