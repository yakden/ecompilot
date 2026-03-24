// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — legal-service / middleware / cache
// Redis-based response caching for Fastify routes
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal Redis client interface — satisfied by ioredis or compatible clients
// ─────────────────────────────────────────────────────────────────────────────

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiryMode: "EX", time: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level singleton — set once via initCache() before registering routes
// ─────────────────────────────────────────────────────────────────────────────

let _redis: RedisClient | null = null;

export function initCache(client: RedisClient): void {
  _redis = client;
}

export function getRedis(): RedisClient | null {
  return _redis;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache key derivation
// Format: legal:{pathname}:{sorted-querystring}
// ─────────────────────────────────────────────────────────────────────────────

function buildCacheKey(request: FastifyRequest): string {
  const url = new URL(request.url, "http://x");
  const params = [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const qs = params.length > 0 ? `:${params}` : "";
  return `legal:${url.pathname}${qs}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cached response envelope stored in Redis
// ─────────────────────────────────────────────────────────────────────────────

interface CachedEnvelope {
  readonly statusCode: number;
  readonly body: string;
  readonly contentType: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// cacheResponse — returns a { preHandler, onSend } hook pair
//
// Usage:
//   const { preHandler, onSend } = cacheResponse(TTL_24H);
//   app.get("/path", { preHandler, onSend }, handler);
// ─────────────────────────────────────────────────────────────────────────────

export const TTL_24H = 86_400;
export const TTL_7D = 604_800;

export interface CacheHooks {
  preHandler: (
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ) => void;
  onSend: (
    request: FastifyRequest,
    reply: FastifyReply,
    payload: unknown,
    done: HookHandlerDoneFunction,
  ) => void;
}

export function cacheResponse(ttlSeconds: number): CacheHooks {
  const preHandler = (
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void => {
    const redis = getRedis();
    if (!redis || request.method !== "GET") {
      done();
      return;
    }

    const key = buildCacheKey(request);

    redis
      .get(key)
      .then((raw) => {
        if (raw === null) {
          done();
          return;
        }

        let envelope: CachedEnvelope;
        try {
          envelope = JSON.parse(raw) as CachedEnvelope;
        } catch {
          done();
          return;
        }

        void reply
          .code(envelope.statusCode)
          .header("Content-Type", envelope.contentType)
          .header("X-Cache", "HIT")
          .send(envelope.body);
      })
      .catch(() => {
        done();
      });
  };

  const onSend = (
    request: FastifyRequest,
    reply: FastifyReply,
    payload: unknown,
    done: HookHandlerDoneFunction,
  ): void => {
    const redis = getRedis();
    const isCacheHit = reply.getHeader("X-Cache") === "HIT";

    if (!redis || request.method !== "GET" || isCacheHit || reply.statusCode >= 400) {
      done();
      return;
    }

    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    const contentType =
      (reply.getHeader("Content-Type") as string | undefined) ?? "application/json";

    const envelope: CachedEnvelope = {
      statusCode: reply.statusCode,
      body,
      contentType,
    };

    const key = buildCacheKey(request);

    redis
      .set(key, JSON.stringify(envelope), "EX", ttlSeconds)
      .catch(() => undefined)
      .finally(() => {
        reply.header("X-Cache", "MISS");
        done();
      });
  };

  return { preHandler, onSend };
}

// ─────────────────────────────────────────────────────────────────────────────
// invalidatePattern — deletes all Redis keys matching a glob pattern
// Safe to call even when Redis is unavailable (no-op)
// ─────────────────────────────────────────────────────────────────────────────

export async function invalidatePattern(pattern: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;

  const keys = await redis.keys(pattern);
  if (keys.length === 0) return 0;

  await Promise.all(keys.map((k) => redis.del(k)));
  return keys.length;
}
