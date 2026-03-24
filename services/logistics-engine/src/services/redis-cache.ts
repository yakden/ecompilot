// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — logistics-engine
// RedisCache — minimal interface for Redis GET/SET operations used by
// public tracking services.
//
// Defined as an interface so it is satisfied by any ioredis Redis instance
// without importing ioredis types directly in every service file.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal Redis interface used exclusively for caching in public tracking
 * services.  A real ioredis `Redis` instance satisfies this contract.
 */
export interface RedisCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiryMode: "EX", time: number): Promise<unknown>;
  quit(): Promise<unknown>;
}
