// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — content-service
// Shared Redis client singleton (ioredis) reused by product data API services
// ─────────────────────────────────────────────────────────────────────────────

import Redis from "ioredis";
import { env } from "../config/env.js";
import { createLogger } from "@ecompilot/shared-observability";

const logger = createLogger({ service: "content-service" });

let _redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (_redis !== null) return _redis;

  const url = new URL(env.REDIS_URL);

  _redis = new Redis({
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password !== "" ? url.password : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    lazyConnect: true,
    // Do not crash the process on transient Redis errors
    reconnectOnError: () => true,
  });

  _redis.on("error", (err: unknown) => {
    logger.error({ err }, "Redis client error");
  });

  return _redis;
}

export async function closeRedisClient(): Promise<void> {
  if (_redis !== null) {
    await _redis.quit();
    _redis = null;
  }
}
