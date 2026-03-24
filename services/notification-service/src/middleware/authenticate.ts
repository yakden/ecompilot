// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — notification-service: JWT authentication preHandler
// Validates Bearer token from the Authorization header
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyRequest, FastifyReply } from "fastify";
import { createVerifier } from "fast-jwt";
import type { JWTPayload } from "@ecompilot/shared-types";

// ─────────────────────────────────────────────────────────────────────────────
// Fastify type augmentation — attach typed user to request
// ─────────────────────────────────────────────────────────────────────────────

declare module "fastify" {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT verifier — uses the public key from env or a shared secret
// Notification service only reads tokens issued by auth-service
// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET =
  process.env["JWT_PUBLIC_KEY"] ?? process.env["JWT_SECRET"];

if (!JWT_SECRET) {
  throw new Error(
    "FATAL: JWT_PUBLIC_KEY or JWT_SECRET must be set. Cannot start without authentication key.",
  );
}

const verifyToken = createVerifier({ key: JWT_SECRET });

// ─────────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────────

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (authHeader === undefined || !authHeader.startsWith("Bearer ")) {
    await reply.status(401).send({
      success: false,
      error: {
        code: "AUTH_UNAUTHORIZED",
        message: "Missing or invalid Authorization header",
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token) as JWTPayload;
    request.user = payload;
  } catch (err) {
    const isExpired =
      err instanceof Error &&
      (err.message.includes("expired") || err.name === "TokenExpiredError");

    await reply.status(401).send({
      success: false,
      error: {
        code: isExpired ? "AUTH_TOKEN_EXPIRED" : "AUTH_TOKEN_INVALID",
        message: isExpired ? "Access token has expired" : "Invalid access token",
        timestamp: new Date().toISOString(),
      },
    });
  }
}
