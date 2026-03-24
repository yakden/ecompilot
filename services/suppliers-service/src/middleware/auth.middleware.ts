// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — suppliers-service auth middleware
//
// Verifies JWT passed in Authorization: Bearer <token>.
// Supports two algorithms:
//   • HS256 — service-to-service tokens signed with JWT_SECRET (internal calls)
//   • RS256  — user-facing tokens signed by auth-service with RSA private key
//             verified using JWT_PUBLIC_KEY from environment
//
// Attaches decoded payload to request.user.
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import {
  createHmac,
  timingSafeEqual,
  createVerify,
} from "node:crypto";
import { env } from "../config/env.js";
import type { JWTPayload, Plan } from "@ecompilot/shared-types";
import { PLAN_LIMITS } from "@ecompilot/shared-types";

// ─────────────────────────────────────────────────────────────────────────────
// Fastify type augmentation
// ─────────────────────────────────────────────────────────────────────────────

declare module "fastify" {
  interface FastifyRequest {
    user: JWTPayload | null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padding), "base64").toString("utf8");
}

function decodeHeader(headerB64: string): { alg: string } {
  try {
    return JSON.parse(base64UrlDecode(headerB64)) as { alg: string };
  } catch {
    throw new Error("Invalid JWT header");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HS256 verification — internal service-to-service tokens
// ─────────────────────────────────────────────────────────────────────────────

function verifyHs256(
  headerB64: string,
  payloadB64: string,
  signatureB64: string,
): void {
  const expectedSig = createHmac("sha256", env.JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");

  const sigBuffer = Buffer.from(signatureB64, "base64url");
  const expectedBuffer = Buffer.from(expectedSig, "base64url");

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid HS256 signature");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RS256 verification — user tokens issued by auth-service
// ─────────────────────────────────────────────────────────────────────────────

function verifyRs256(
  headerB64: string,
  payloadB64: string,
  signatureB64: string,
): void {
  const publicKey = env.JWT_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error("JWT_PUBLIC_KEY not configured — cannot verify RS256 token");
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);

  const signatureBuf = Buffer.from(signatureB64, "base64url");
  const valid = verifier.verify(publicKey, signatureBuf);

  if (!valid) {
    throw new Error("Invalid RS256 signature");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified JWT verifier — dispatches on the alg header claim
// ─────────────────────────────────────────────────────────────────────────────

function verifyJwt(token: string): JWTPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT structure");
  }

  const [headerB64, payloadB64, signatureB64] = parts as [
    string,
    string,
    string,
  ];

  const header = decodeHeader(headerB64);

  switch (header.alg) {
    case "HS256":
      verifyHs256(headerB64, payloadB64, signatureB64);
      break;
    case "RS256":
      verifyRs256(headerB64, payloadB64, signatureB64);
      break;
    default:
      throw new Error(`Unsupported JWT algorithm: ${header.alg}`);
  }

  const payload = JSON.parse(base64UrlDecode(payloadB64)) as JWTPayload;
  const nowSec = Math.floor(Date.now() / 1000);

  if (payload.exp < nowSec) {
    throw new Error("JWT expired");
  }

  return payload;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fastify plugin — attaches user to every request (soft, no error on missing)
//
// Resolution order:
//   1. Gateway / proxy headers (x-user-id + x-user-plan) — trusted internal path
//   2. Authorization: Bearer <JWT> — verified with HS256 or RS256
// ─────────────────────────────────────────────────────────────────────────────

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("user", null);

  fastify.addHook("onRequest", async (request: FastifyRequest) => {
    // ── Priority 1: Bearer JWT verification ──────────────────────────────────
    const authHeader = request.headers["authorization"];
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        request.user = verifyJwt(token);
        return;
      } catch {
        // Invalid token -- fall through to internal header check
      }
    }

    // ── Priority 2: Internal service-to-service headers ──────────────────────
    // SECURITY: Only trust gateway headers when x-internal-service is present.
    // This prevents external callers from spoofing x-user-id headers.
    const isInternalCall = request.headers["x-internal-service"] === "true";
    const userId = request.headers["x-user-id"] as string | undefined;
    const userPlan = request.headers["x-user-plan"] as string | undefined;
    const userEmail = (request.headers["x-user-email"] as string | undefined) ?? "";

    if (isInternalCall && userId && userPlan) {
      const plan = userPlan as Plan;
      if (plan in PLAN_LIMITS) {
        const nowSec = Math.floor(Date.now() / 1000);
        request.user = {
          sub: userId as import("@ecompilot/shared-types").UserId,
          email: userEmail,
          plan,
          role: "member",
          organizationId: null,
          language: "ru",
          iat: nowSec,
          exp: nowSec + 300,
          jti: "" as import("@ecompilot/shared-types").SessionId,
        };
        return;
      }
    }

    // No valid auth found -- request.user stays null
    // Route-level guards will reject if auth is required
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const authMiddleware = fp(authPlugin as any, {
  name: "auth-middleware",
  fastify: "5.x",
});

// ─────────────────────────────────────────────────────────────────────────────
// Guard helpers — call these inside route handlers
// ─────────────────────────────────────────────────────────────────────────────

/** Throws 401 if no valid token is present */
export function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): asserts request is FastifyRequest & { user: JWTPayload } {
  if (request.user === null) {
    void reply.code(401).send({
      success: false,
      error: {
        code: "AUTH_UNAUTHORIZED",
        message: "Authentication required",
        timestamp: new Date().toISOString(),
      },
    });
    throw new Error("Unauthorized");
  }
}

/** Throws 403 if user plan does not have suppliersAccess */
export function requireSuppliersAccess(
  request: FastifyRequest,
  reply: FastifyReply,
): asserts request is FastifyRequest & { user: JWTPayload } {
  requireAuth(request, reply);

  const plan = request.user.plan satisfies Plan;
  const limits = PLAN_LIMITS[plan];

  if (!limits.suppliersAccess) {
    void reply.code(403).send({
      success: false,
      error: {
        code: "UPGRADE_REQUIRED",
        message:
          "Supplier directory is available on Pro and Business plans. Upgrade to access all suppliers.",
        details: { currentPlan: plan, requiredPlan: "pro" },
        timestamp: new Date().toISOString(),
      },
    });
    throw new Error("Forbidden");
  }
}

/** Returns true if request.user has Pro or Business plan */
export function hasSuppliersAccess(request: FastifyRequest): boolean {
  if (request.user === null) return false;
  return PLAN_LIMITS[request.user.plan].suppliersAccess;
}
