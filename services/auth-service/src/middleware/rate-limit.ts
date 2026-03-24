// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — auth-service: Redis-based rate limiting middleware
// 5 login attempts per 15 minutes per IP
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyRequest, FastifyReply } from "fastify";
import { getRedis } from "../services/redis.service.js";

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60; // 15 minutes
const KEY_PREFIX = "rate_limit:login:";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function checkLoginRateLimit(ip: string): Promise<RateLimitResult> {
  const redis = getRedis();
  const key = `${KEY_PREFIX}${ip}`;

  const current = await redis.incr(key);

  // Set TTL on first increment
  if (current === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }

  const ttl = await redis.ttl(key);
  const resetAt = new Date(Date.now() + Math.max(ttl, 0) * 1000);
  const remaining = Math.max(0, MAX_ATTEMPTS - current);

  return {
    allowed: current <= MAX_ATTEMPTS,
    remaining,
    resetAt,
  };
}

export async function resetLoginRateLimit(ip: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${KEY_PREFIX}${ip}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fastify preHandler
// ─────────────────────────────────────────────────────────────────────────────

export async function loginRateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const ip = request.ip;
  const result = await checkLoginRateLimit(ip);

  reply.header("X-RateLimit-Limit", String(MAX_ATTEMPTS));
  reply.header("X-RateLimit-Remaining", String(result.remaining));
  reply.header("X-RateLimit-Reset", result.resetAt.toISOString());

  if (!result.allowed) {
    await reply.status(429).send({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many login attempts. Please try again later.",
        details: {
          retryAfter: result.resetAt.toISOString(),
        },
        timestamp: new Date().toISOString(),
      },
    });
  }
}
