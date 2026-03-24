// ---------------------------------------------------------------------------
// EcomPilot PL -- shared-auth
// Reusable Fastify authentication middleware with JWT (RS256/HS256) verification
// and internal service-to-service header trust.
//
// SECURITY: Never trust x-user-id / x-user-plan headers from external callers.
// Only trust them when x-internal-service header is present (service mesh).
// ---------------------------------------------------------------------------

import type {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
  FastifyPluginAsync,
  onRequestHookHandler,
} from "fastify";
import { importSPKI, jwtVerify } from "jose";
import { createHmac, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  /** User ID (JWT sub claim) */
  readonly sub: string;
  /** User email */
  readonly email: string;
  /** Subscription plan */
  readonly plan: string;
  /** User language */
  readonly language: string;
  /** User role */
  readonly role?: string;
  /** Organization ID */
  readonly organizationId?: string | null;
}

export interface AuthMiddlewareConfig {
  /** RSA public key in PEM format for RS256 verification */
  jwtPublicKey?: string;
  /** HMAC secret for HS256 verification (service-to-service) */
  jwtSecret?: string;
  /**
   * If true, trust x-user-id / x-user-plan headers ONLY when
   * x-internal-service header is also present.
   * Default: true
   */
  allowInternalHeaders?: boolean;
  /**
   * Internal service secret that must match x-internal-service header value.
   * If not set, the header value "true" is accepted.
   */
  internalServiceSecret?: string;
}

// ---------------------------------------------------------------------------
// Fastify type augmentation
// ---------------------------------------------------------------------------

declare module "fastify" {
  interface FastifyRequest {
    authUser: AuthUser | null;
  }
}

// ---------------------------------------------------------------------------
// JWT helpers -- low-level base64url decoding
// ---------------------------------------------------------------------------

function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padding), "base64").toString("utf8");
}

function decodeJwtHeader(token: string): { alg: string } {
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) throw new Error("Invalid JWT structure");
  const headerB64 = token.slice(0, dotIndex);
  return JSON.parse(base64UrlDecode(headerB64)) as { alg: string };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT structure");
  const payloadB64 = parts[1]!;
  return JSON.parse(base64UrlDecode(payloadB64)) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// HS256 verification (node:crypto, no jose dependency needed)
// ---------------------------------------------------------------------------

function verifyHs256(token: string, secret: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT structure");

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const expectedSig = createHmac("sha256", secret)
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

  const payload = JSON.parse(base64UrlDecode(payloadB64)) as Record<string, unknown>;
  const nowSec = Math.floor(Date.now() / 1000);

  if (typeof payload["exp"] === "number" && payload["exp"] < nowSec) {
    throw new Error("JWT expired");
  }

  return payload;
}

// ---------------------------------------------------------------------------
// RS256 verification using jose
// ---------------------------------------------------------------------------

let _cachedPublicKey: Awaited<ReturnType<typeof importSPKI>> | null = null;

async function verifyRs256(
  token: string,
  publicKeyPem: string,
): Promise<Record<string, unknown>> {
  if (_cachedPublicKey === null) {
    _cachedPublicKey = await importSPKI(publicKeyPem, "RS256");
  }

  const { payload } = await jwtVerify(token, _cachedPublicKey, {
    algorithms: ["RS256"],
  });

  return payload as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Unified JWT verifier
// ---------------------------------------------------------------------------

async function verifyToken(
  token: string,
  config: AuthMiddlewareConfig,
): Promise<Record<string, unknown>> {
  const header = decodeJwtHeader(token);

  switch (header.alg) {
    case "HS256": {
      if (!config.jwtSecret) {
        throw new Error("JWT_SECRET not configured -- cannot verify HS256 token");
      }
      return verifyHs256(token, config.jwtSecret);
    }
    case "RS256": {
      if (!config.jwtPublicKey) {
        throw new Error("JWT_PUBLIC_KEY not configured -- cannot verify RS256 token");
      }
      return await verifyRs256(token, config.jwtPublicKey);
    }
    default:
      throw new Error(`Unsupported JWT algorithm: ${header.alg}`);
  }
}

// ---------------------------------------------------------------------------
// Extract AuthUser from JWT payload
// ---------------------------------------------------------------------------

function payloadToAuthUser(payload: Record<string, unknown>): AuthUser {
  return {
    sub: String(payload["sub"] ?? ""),
    email: String(payload["email"] ?? ""),
    plan: String(payload["plan"] ?? "free"),
    language: String(payload["language"] ?? "ru"),
    role: typeof payload["role"] === "string" ? payload["role"] : undefined,
    organizationId:
      typeof payload["organizationId"] === "string"
        ? payload["organizationId"]
        : null,
  };
}

// ---------------------------------------------------------------------------
// createAuthMiddleware -- returns a Fastify preHandler hook
// ---------------------------------------------------------------------------

export function createAuthMiddleware(
  config: AuthMiddlewareConfig,
): onRequestHookHandler {
  const allowInternal = config.allowInternalHeaders !== false;

  return async function authMiddleware(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    // Ensure decoration exists
    if (!("authUser" in request)) {
      (request as Record<string, unknown>)["authUser"] = null;
    }

    // -- Priority 1: Bearer JWT in Authorization header --
    const authHeader = request.headers["authorization"];
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        const payload = await verifyToken(token, config);
        request.authUser = payloadToAuthUser(payload);
        return;
      } catch {
        // Invalid token -- fall through to internal header check or remain null
      }
    }

    // -- Priority 2: Internal service-to-service headers --
    if (allowInternal) {
      const internalHeader = request.headers["x-internal-service"] as string | undefined;
      const expectedSecret = config.internalServiceSecret ?? "true";

      if (internalHeader === expectedSecret) {
        const userId = request.headers["x-user-id"] as string | undefined;
        const userPlan = request.headers["x-user-plan"] as string | undefined;

        if (userId && userId.length > 0 && userPlan && userPlan.length > 0) {
          const userEmail = (request.headers["x-user-email"] as string | undefined) ?? "";
          const userLanguage = (request.headers["x-user-language"] as string | undefined) ?? "ru";

          request.authUser = {
            sub: userId,
            email: userEmail,
            plan: userPlan,
            language: userLanguage,
          };
          return;
        }
      }
    }

    // No valid auth found -- authUser remains null
    // Route-level guards decide whether to reject
  };
}

// ---------------------------------------------------------------------------
// requireAuth -- preHandler that rejects unauthenticated requests
// ---------------------------------------------------------------------------

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (request.authUser === null || request.authUser === undefined) {
    await reply.status(401).send({
      success: false,
      error: {
        code: "AUTH_UNAUTHORIZED",
        message: "Authentication required",
        timestamp: new Date().toISOString(),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// requirePlan -- preHandler factory that checks subscription plan
// ---------------------------------------------------------------------------

export function requirePlan(
  allowedPlans: string[],
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async function planGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (request.authUser === null || request.authUser === undefined) {
      await reply.status(401).send({
        success: false,
        error: {
          code: "AUTH_UNAUTHORIZED",
          message: "Authentication required",
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    if (!allowedPlans.includes(request.authUser.plan)) {
      await reply.status(403).send({
        success: false,
        error: {
          code: "UPGRADE_REQUIRED",
          message: `This feature requires one of the following plans: ${allowedPlans.join(", ")}`,
          details: {
            currentPlan: request.authUser.plan,
            requiredPlans: allowedPlans,
          },
          timestamp: new Date().toISOString(),
        },
      });
    }
  };
}

// ---------------------------------------------------------------------------
// requireInternalService -- preHandler that only allows internal calls
// ---------------------------------------------------------------------------

export function requireInternalService(
  secret?: string,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const expectedSecret = secret ?? "true";

  return async function internalGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const internalHeader = request.headers["x-internal-service"] as string | undefined;
    if (internalHeader !== expectedSecret) {
      await reply.status(403).send({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "This endpoint is only accessible to internal services",
          timestamp: new Date().toISOString(),
        },
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Fastify plugin -- decorates request and registers the auth hook globally
// ---------------------------------------------------------------------------

export function createAuthPlugin(
  config: AuthMiddlewareConfig,
): FastifyPluginAsync {
  return async function authPlugin(fastify: FastifyInstance): Promise<void> {
    // Decorate request with authUser
    fastify.decorateRequest("authUser", null);

    // Register the auth middleware on every request
    const middleware = createAuthMiddleware(config);
    fastify.addHook("onRequest", middleware);
  };
}

// ---------------------------------------------------------------------------
// Socket.io JWT verification helper
// ---------------------------------------------------------------------------

export async function verifySocketToken(
  token: string,
  config: AuthMiddlewareConfig,
): Promise<AuthUser> {
  const payload = await verifyToken(token, config);
  return payloadToAuthUser(payload);
}

// ---------------------------------------------------------------------------
// Re-export types for convenience
// ---------------------------------------------------------------------------

export type { AuthMiddlewareConfig as SharedAuthConfig };
