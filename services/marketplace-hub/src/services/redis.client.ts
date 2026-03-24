// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — marketplace-hub: ioredis singleton
//
// ioredis is a peer dependency of bullmq. This module wraps the ioredis
// import so that the rest of the codebase imports from here rather than
// directly from "ioredis", making the type surface consistent.
// ─────────────────────────────────────────────────────────────────────────────

// ioredis is an ESM-compatible package. Import it with a standard ESM default
// import — using require() here causes "ReferenceError: require is not defined"
// because this package is compiled as ESM (type: "module" in package.json).
import IoRedis from "ioredis";

export type Redis = IoRedis;

export function createRedisClient(url: string): IoRedis {
  return new IoRedis(url, {
    // BullMQ requires maxRetriesPerRequest to be null — any numeric value
    // causes BullMQ to throw "maxRetriesPerRequest must be null" at startup.
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });
}
