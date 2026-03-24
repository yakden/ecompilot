// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — auth-service: JWT authentication preHandler
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken } from "../services/token.service.js";
import type { AccessTokenPayload } from "../services/token.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fastify type augmentation — attach user to request
// ─────────────────────────────────────────────────────────────────────────────

declare module "fastify" {
  interface FastifyRequest {
    user?: AccessTokenPayload;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────────

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
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
    const payload = await verifyAccessToken(token);
    request.user = payload;
  } catch (err) {
    const isExpired =
      err instanceof Error &&
      (err.message.includes("expired") || err.name === "JWTExpired");

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
