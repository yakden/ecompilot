/**
 * Configurable rate limiter factory.
 *
 * Supports: fixed-window, sliding-window, token-bucket algorithms.
 * Redis-backed with automatic in-memory fallback.
 */

import type { FastifyReply, FastifyRequest } from "fastify";

export type RateLimitAlgorithm = "fixed-window" | "sliding-window" | "token-bucket";

export interface RateLimitConfig {
  algorithm?: RateLimitAlgorithm;
  max: number;
  windowSeconds: number;
  keyGenerator?: (request: FastifyRequest) => string;
  keyPrefix?: string;
  redis?: RedisLike;
  errorMessage?: string;
  statusCode?: number;
  includeHeaders?: boolean;
  refillRate?: number;
  burstCapacity?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export interface RedisLike {
  multi(): RedisPipeline;
  eval(script: string, numkeys: number, ...args: (string | number)[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: string[]): Promise<unknown>;
  del(key: string): Promise<number>;
  status?: string;
}

export interface RedisPipeline {
  incr(key: string): this;
  expire(key: string, seconds: number): this;
  exec(): Promise<Array<[error: Error | null, result: unknown]> | null>;
}

interface MemoryEntry { count: number; resetAt: number; }
interface TokenBucketEntry { tokens: number; lastRefill: number; }

class MemoryStore {
  private readonly entries = new Map<string, MemoryEntry>();
  private readonly buckets = new Map<string, TokenBucketEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | undefined;

  constructor() {
    this.cleanupInterval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      for (const [key, entry] of this.entries) {
        if (entry.resetAt <= now) this.entries.delete(key);
      }
    }, 60_000);
    if (this.cleanupInterval.unref) this.cleanupInterval.unref();
  }

  fixedWindow(key: string, max: number, windowSeconds: number): RateLimitResult {
    const now = Math.floor(Date.now() / 1000);
    const windowKey = `${key}:${Math.floor(now / windowSeconds)}`;
    let entry = this.entries.get(windowKey);
    if (entry === undefined || entry.resetAt <= now) {
      entry = { count: 0, resetAt: (Math.floor(now / windowSeconds) + 1) * windowSeconds };
    }
    entry.count += 1;
    this.entries.set(windowKey, entry);
    return { allowed: entry.count <= max, remaining: Math.max(0, max - entry.count), resetAt: entry.resetAt, limit: max };
  }

  slidingWindow(key: string, max: number, windowSeconds: number): RateLimitResult {
    const now = Math.floor(Date.now() / 1000);
    const currentWindow = Math.floor(now / windowSeconds);
    const currentKey = `${key}:${currentWindow}`;
    const previousKey = `${key}:${currentWindow - 1}`;
    let current = this.entries.get(currentKey);
    if (current === undefined) {
      current = { count: 0, resetAt: (currentWindow + 1) * windowSeconds };
    }
    current.count += 1;
    this.entries.set(currentKey, current);
    const previous = this.entries.get(previousKey);
    const previousCount = previous?.count ?? 0;
    const elapsed = now - currentWindow * windowSeconds;
    const weight = 1 - elapsed / windowSeconds;
    const estimatedCount = Math.floor(previousCount * weight) + current.count;
    return { allowed: estimatedCount <= max, remaining: Math.max(0, max - estimatedCount), resetAt: (currentWindow + 1) * windowSeconds, limit: max };
  }

  tokenBucket(key: string, capacity: number, refillRate: number): RateLimitResult {
    const now = Date.now() / 1000;
    let bucket = this.buckets.get(key);
    if (bucket === undefined) bucket = { tokens: capacity, lastRefill: now };
    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillRate);
    bucket.lastRefill = now;
    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return { allowed, remaining: Math.max(0, Math.floor(bucket.tokens)), resetAt: Math.ceil(now + (capacity - bucket.tokens) / refillRate), limit: capacity };
  }

  destroy(): void {
    if (this.cleanupInterval) { clearInterval(this.cleanupInterval); this.cleanupInterval = undefined; }
    this.entries.clear();
    this.buckets.clear();
  }
}

const FIXED_WINDOW_SCRIPT = `
local key = KEYS[1]
local max = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local current = redis.call('INCR', key)
if current == 1 then redis.call('EXPIRE', key, window) end
local ttl = redis.call('TTL', key)
return {current, ttl}`;

const SLIDING_WINDOW_SCRIPT = `
local ck = KEYS[1]
local pk = KEYS[2]
local max = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local weight = tonumber(ARGV[3])
local current = redis.call('INCR', ck)
if current == 1 then redis.call('EXPIRE', ck, window * 2) end
local previous = tonumber(redis.call('GET', pk) or '0')
local estimated = math.floor(previous * weight) + current
local ttl = redis.call('TTL', ck)
return {estimated, ttl, current}`;

const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local data = redis.call('GET', key)
local tokens, last_refill
if data then
  local parts = {}
  for part in string.gmatch(data, '([^:]+)') do parts[#parts+1] = part end
  tokens = tonumber(parts[1])
  last_refill = tonumber(parts[2])
else tokens = capacity; last_refill = now end
local elapsed = now - last_refill
tokens = math.min(capacity, tokens + elapsed * refill_rate)
last_refill = now
local allowed = 0
if tokens >= 1 then tokens = tokens - 1; allowed = 1 end
redis.call('SET', key, tokens..':'..last_refill, 'EX', math.ceil(capacity / refill_rate) + 10)
return {allowed, math.floor(tokens)}`;

async function redisFixedWindow(redis: RedisLike, key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `${key}:${Math.floor(now / windowSeconds)}`;
  const result = (await redis.eval(FIXED_WINDOW_SCRIPT, 1, windowKey, max, windowSeconds)) as [number, number];
  const [count, ttl] = result;
  return { allowed: count <= max, remaining: Math.max(0, max - count), resetAt: now + (ttl > 0 ? ttl : windowSeconds), limit: max };
}

async function redisSlidingWindow(redis: RedisLike, key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const cw = Math.floor(now / windowSeconds);
  const ck = `${key}:${cw}`;
  const pk = `${key}:${cw - 1}`;
  const elapsed = now - cw * windowSeconds;
  const weight = 1 - elapsed / windowSeconds;
  const result = (await redis.eval(SLIDING_WINDOW_SCRIPT, 2, ck, pk, max, windowSeconds, weight)) as [number, number, number];
  const [estimated, ttl] = result;
  return { allowed: estimated <= max, remaining: Math.max(0, max - estimated), resetAt: now + (ttl > 0 ? ttl : windowSeconds), limit: max };
}

async function redisTokenBucket(redis: RedisLike, key: string, capacity: number, refillRate: number): Promise<RateLimitResult> {
  const now = Date.now() / 1000;
  const result = (await redis.eval(TOKEN_BUCKET_SCRIPT, 1, key, capacity, refillRate, now)) as [number, number];
  const [allowed, remaining] = result;
  return { allowed: allowed === 1, remaining, resetAt: Math.ceil(now + (capacity - remaining) / refillRate), limit: capacity };
}

export function createRateLimiter(config: RateLimitConfig): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const {
    algorithm = "sliding-window", max, windowSeconds, keyPrefix = "rl", redis,
    errorMessage = "Too many requests. Please try again later.",
    statusCode = 429, includeHeaders = true,
    refillRate = max / windowSeconds, burstCapacity = max,
  } = config;
  const keyGen = config.keyGenerator ?? ((request: FastifyRequest) => request.ip);
  const memoryStore = new MemoryStore();
  let redisAvailable = redis !== undefined;

  async function check(key: string): Promise<RateLimitResult> {
    const fullKey = `${keyPrefix}:${key}`;
    if (redisAvailable && redis !== undefined) {
      try {
        switch (algorithm) {
          case "fixed-window": return await redisFixedWindow(redis, fullKey, max, windowSeconds);
          case "sliding-window": return await redisSlidingWindow(redis, fullKey, max, windowSeconds);
          case "token-bucket": return await redisTokenBucket(redis, fullKey, burstCapacity, refillRate);
        }
      } catch { redisAvailable = false; }
    }
    switch (algorithm) {
      case "fixed-window": return memoryStore.fixedWindow(fullKey, max, windowSeconds);
      case "sliding-window": return memoryStore.slidingWindow(fullKey, max, windowSeconds);
      case "token-bucket": return memoryStore.tokenBucket(fullKey, burstCapacity, refillRate);
    }
  }

  return async function rateLimitHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const key = keyGen(request);
    const result = await check(key);
    if (includeHeaders) {
      void reply.header("X-RateLimit-Limit", String(result.limit));
      void reply.header("X-RateLimit-Remaining", String(result.remaining));
      void reply.header("X-RateLimit-Reset", String(result.resetAt));
    }
    if (!result.allowed) {
      void reply.header("Retry-After", String(result.resetAt - Math.floor(Date.now() / 1000)));
      void reply.status(statusCode).send({ statusCode, error: "Too Many Requests", message: errorMessage });
    }
  };
}

export { MemoryStore };