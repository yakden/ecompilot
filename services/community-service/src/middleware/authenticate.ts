// ---------------------------------------------------------------------------
// EcomPilot PL -- community-service: JWT authentication preHandler
// Uses shared-auth for JWT verification instead of blindly trusting headers
// ---------------------------------------------------------------------------

import type { FastifyRequest, FastifyReply } from "fastify";
import type { Plan } from "@ecompilot/shared-types";
import { requireAuth } from "@ecompilot/shared-auth";

// ---------------------------------------------------------------------------
// Token payload extracted from verified JWT (set by shared-auth middleware)
// ---------------------------------------------------------------------------

export interface AuthUser {
  readonly userId: string;
  readonly email: string;
  readonly plan: Plan;
  readonly language: string;
}

// ---------------------------------------------------------------------------
// Fastify type augmentation
// ---------------------------------------------------------------------------

declare module "fastify" {
  interface FastifyRequest {
    authUser_community?: AuthUser;
  }
}

// ---------------------------------------------------------------------------
// Middleware -- reads from request.authUser (set by shared-auth plugin)
// ---------------------------------------------------------------------------

/**
 * Reads authenticated user context from the JWT verified by shared-auth
 * middleware. Responds 401 if no valid authentication is present.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Delegate to shared-auth requireAuth for 401 handling
  await requireAuth(request, reply);

  // If we get past requireAuth, authUser is guaranteed to be set
  const user = request.authUser;
  if (!user) return;

  const validPlans: Plan[] = ["free", "pro", "business"];
  const plan = validPlans.includes(user.plan as Plan)
    ? (user.plan as Plan)
    : "free";

  request.authUser_community = {
    userId: user.sub,
    email: user.email,
    plan,
    language: user.language ?? "ru",
  };

  // Also set the legacy authUser property for backward compat with routes
  // that read request.authUser (the Fastify augmented property from old code)
  // The shared-auth already populates request.authUser with the full payload.
}

// ---------------------------------------------------------------------------
// Plan guard -- restricts routes to Pro+ subscribers
// ---------------------------------------------------------------------------

export async function requireProPlan(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.authUser;

  if (!user) {
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

  const proPlans: Plan[] = ["pro", "business"];
  if (!proPlans.includes(user.plan as Plan)) {
    await reply.status(403).send({
      success: false,
      error: {
        code: "UPGRADE_REQUIRED",
        message: "This feature requires a Pro or Business subscription",
        timestamp: new Date().toISOString(),
      },
    });
  }
}
