// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — academy-service / middleware/auth.middleware.ts
// JWT authentication preHandler for Fastify — optional & required variants
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  FastifyRequest,
  FastifyReply,
  preHandlerHookHandler,
} from "fastify";
import { env } from "../config/env.js";
import type { JWTPayload } from "@ecompilot/shared-types";

// ─────────────────────────────────────────────────────────────────────────────
// Augment FastifyRequest
// ─────────────────────────────────────────────────────────────────────────────

declare module "fastify" {
  interface FastifyRequest {
    /** Populated by createAuthMiddleware — always set on protected routes */
    user: JWTPayload;
    /** Populated by createOptionalAuthMiddleware — may be undefined */
    userOptional: JWTPayload | undefined;
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

  const [headerB64, payloadB64, signatureB64] = parts as [
    string,
    string,
    string,
  ];

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
// Factory: required authentication — rejects unauthenticated requests
// ─────────────────────────────────────────────────────────────────────────────

export function createAuthMiddleware(
  logger: { warn: (obj: object, msg: string) => void },
): preHandlerHookHandler {
  return async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
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
      request.user = verifyAndDecodeJwt(token);
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
// Factory: optional authentication — attaches user if token present, no-ops if absent
// Used on course list / course detail to inject progress for authenticated users
// ─────────────────────────────────────────────────────────────────────────────

export function createOptionalAuthMiddleware(): preHandlerHookHandler {
  return async function optionalAuthenticate(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const authHeader = request.headers.authorization;
    request.userOptional = undefined;

    if (!authHeader?.startsWith("Bearer ")) {
      return;
    }

    const token = authHeader.slice(7);
    try {
      request.userOptional = verifyAndDecodeJwt(token);
    } catch {
      // Silently ignore invalid/expired tokens on optional routes
    }
  };
}
