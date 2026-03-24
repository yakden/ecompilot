// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — ai-service / middleware/auth.middleware.ts
// JWT authentication + plan limit enforcement hooks for Fastify
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  FastifyRequest,
  FastifyReply,
  preHandlerHookHandler,
} from "fastify";
import { env } from "../config/env.js";
import type { JWTPayload, Plan, UserId } from "@ecompilot/shared-types";
import { PLAN_LIMITS, isWithinLimit } from "@ecompilot/shared-types";
import type { Redis } from "ioredis";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// Augment FastifyRequest with decoded user context
// ─────────────────────────────────────────────────────────────────────────────

declare module "fastify" {
  interface FastifyRequest {
    user: JWTPayload;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT verifier — HMAC-SHA256, synchronous
// ─────────────────────────────────────────────────────────────────────────────

function verifyAndDecodeJwt(token: string): JWTPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed JWT: expected 3 segments");
  }

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  // Verify HMAC-SHA256 signature
  const data = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac("sha256", env.JWT_SECRET)
    .update(data)
    .digest("base64url");

  const expectedSigBuf = Buffer.from(expectedSig, "base64url");
  const signatureBuf = Buffer.from(signatureB64, "base64url");
  if (
    expectedSigBuf.length !== signatureBuf.length ||
    !timingSafeEqual(expectedSigBuf, signatureBuf)
  ) {
    throw new Error("JWT signature mismatch");
  }

  // Decode payload
  const paddedPayload =
    payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
  let decoded: unknown;
  try {
    decoded = JSON.parse(
      Buffer.from(paddedPayload, "base64url").toString("utf-8"),
    );
  } catch {
    throw new Error("JWT payload is not valid JSON");
  }

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    !("sub" in decoded) ||
    !("exp" in decoded) ||
    !("iat" in decoded) ||
    !("plan" in decoded) ||
    !("jti" in decoded)
  ) {
    throw new Error("JWT payload missing required fields");
  }

  const payload = decoded as JWTPayload;
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (payload.exp < nowSeconds) {
    throw new Error("JWT has expired");
  }

  return payload;
}

// ─────────────────────────────────────────────────────────────────────────────
// Redis key for daily usage tracking
// ─────────────────────────────────────────────────────────────────────────────

function dailyUsageKey(userId: UserId, feature: "aiMessages"): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return `ai:usage:${userId}:${feature}:${today}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory: authentication preHandler
// ─────────────────────────────────────────────────────────────────────────────

export function createAuthMiddleware(logger: Logger): preHandlerHookHandler {
  return async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      await reply.code(401).send({
        success: false,
        error: {
          code: "AUTH_UNAUTHORIZED",
          message: "Missing or malformed Authorization header",
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const token = authHeader.slice(7);

    try {
      const payload = verifyAndDecodeJwt(token);
      request.user = payload;
    } catch (err) {
      logger.warn({ err, reqId: request.id }, "JWT verification failed");
      await reply.code(401).send({
        success: false,
        error: {
          code: "AUTH_TOKEN_INVALID",
          message:
            err instanceof Error
              ? err.message
              : "Invalid authentication token",
          timestamp: new Date().toISOString(),
        },
      });
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory: plan limit check preHandler
// ─────────────────────────────────────────────────────────────────────────────

export function createPlanLimitMiddleware(
  redis: Redis,
  logger: Logger,
): preHandlerHookHandler {
  return async function checkPlanLimit(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const { sub: userId, plan } = request.user;
    const limit = PLAN_LIMITS[plan].aiMessages;

    // Pro and Business have unlimited messages
    if (limit === -1) return;

    const key = dailyUsageKey(userId, "aiMessages");
    let currentUsage: number;

    try {
      const raw = await redis.get(key);
      currentUsage = raw !== null ? parseInt(raw, 10) : 0;
    } catch (err) {
      logger.error({ err, userId }, "Redis error checking plan limit — failing open");
      return;
    }

    if (!isWithinLimit(currentUsage, limit)) {
      logger.info(
        { userId, plan, currentUsage, limit },
        "AI message limit reached",
      );
      await reply.code(429).send({
        success: false,
        error: {
          code: "PLAN_LIMIT_EXCEEDED",
          message: `Daily AI message limit of ${limit} reached. Upgrade to Pro or Business for unlimited messages.`,
          details: {
            plan,
            limit,
            used: currentUsage,
            resetAt: endOfDayIso(),
          },
          timestamp: new Date().toISOString(),
        },
      });
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Increment daily usage counter in Redis
// ─────────────────────────────────────────────────────────────────────────────

export async function incrementUsage(
  redis: Redis,
  userId: UserId,
  logger: Logger,
): Promise<void> {
  const key = dailyUsageKey(userId, "aiMessages");
  try {
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.expireat(key, endOfDayUnix());
    await pipeline.exec();
  } catch (err) {
    logger.error({ err, userId }, "Failed to increment AI usage counter");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory: plan gate — allow only specific plans through
// ─────────────────────────────────────────────────────────────────────────────

export function createPlanGate(
  allowedPlans: readonly Plan[],
  logger: Logger,
): preHandlerHookHandler {
  return async function planGate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const { plan, sub: userId } = request.user;

    if (!(allowedPlans as string[]).includes(plan)) {
      logger.info(
        { userId, plan, requiredPlans: allowedPlans },
        "Feature not available for user plan",
      );
      await reply.code(403).send({
        success: false,
        error: {
          code: "FEATURE_NOT_AVAILABLE",
          message: `This feature requires one of: ${allowedPlans.join(", ")}. Current plan: ${plan}.`,
          details: { currentPlan: plan, requiredPlans: allowedPlans },
          timestamp: new Date().toISOString(),
        },
      });
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Time helpers (UTC)
// ─────────────────────────────────────────────────────────────────────────────

function endOfDayUnix(): number {
  const now = new Date();
  const eod = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
    ),
  );
  return Math.floor(eod.getTime() / 1000);
}

function endOfDayIso(): string {
  const now = new Date();
  const eod = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
    ),
  );
  return eod.toISOString();
}
