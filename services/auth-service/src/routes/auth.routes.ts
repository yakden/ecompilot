// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — auth-service: Auth HTTP routes
// POST /api/v1/auth/register | login | logout | refresh | forgot-password |
//      reset-password | GET /api/v1/auth/me
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { randomBytes, createHash } from "node:crypto";
import { getDb } from "../db/client.js";
import { users, refreshTokens, auditLog } from "../db/schema.js";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from "../services/password.service.js";
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  getRefreshTokenExpiry,
} from "../services/token.service.js";
import { authenticate } from "../middleware/authenticate.js";
import { loginRateLimitMiddleware, resetLoginRateLimit } from "../middleware/rate-limit.js";
import { publishUserRegistered } from "../services/nats.service.js";
import {
  checkVatNumber,
  ViesRequestSchema,
  ViesValidationError,
  ViesServiceUnavailableError,
} from "../services/vies.service.js";
import type { UserRegisteredEvent } from "@ecompilot/event-contracts";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build optional userAgent spread for exactOptionalPropertyTypes
// ─────────────────────────────────────────────────────────────────────────────

function withUserAgent(ua: string | undefined): { userAgent: string } | Record<never, never> {
  return ua !== undefined ? { userAgent: ua } : {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Branded ID helpers — Zod brands require explicit casting
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asEventId = (id: string): any => id;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asCorrelationId = (id: string): any => id;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asUserId = (id: string): any => id;

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────────

const RegisterBodySchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
  language: z.enum(["ru", "pl", "ua", "en"]).default("ru"),
});

const LoginBodySchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

const RefreshBodySchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

const ForgotPasswordBodySchema = z.object({
  email: z.string().email("Invalid email format"),
});

const ResetPasswordBodySchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(1, "Password is required"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: safe user response (no passwordHash)
// ─────────────────────────────────────────────────────────────────────────────

type SafeUser = {
  id: string;
  email: string;
  language: string;
  plan: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
  lastLoginAt: Date | null;
};

function toSafeUser(user: typeof users.$inferSelect): SafeUser {
  return {
    id: user.id,
    email: user.email,
    language: user.language,
    plan: user.plan,
    emailVerified: user.emailVerified,
    mfaEnabled: user.mfaEnabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: write audit log entry
// ─────────────────────────────────────────────────────────────────────────────

async function writeAuditLog(
  params: {
    userId?: string;
    action: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    failureReason?: string;
    metadata?: Record<string, unknown>;
  },
  log?: Logger,
): Promise<void> {
  try {
    const db = getDb();
    // Use returning() to satisfy Drizzle's chainable query builder
    await db
      .insert(auditLog)
      .values({
        ...(params.userId !== undefined ? { userId: params.userId } : {}),
        action: params.action,
        ...(params.ipAddress !== undefined ? { ipAddress: params.ipAddress } : {}),
        ...(params.userAgent !== undefined ? { userAgent: params.userAgent } : {}),
        success: params.success,
        ...(params.failureReason !== undefined ? { failureReason: params.failureReason } : {}),
        ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
      })
      .returning();
  } catch (err) {
    // Audit failures must never break the auth flow
    log?.warn({ err, action: params.action }, "Failed to write audit log");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────────────────────────────────────────

export async function authRoutes(
  fastify: FastifyInstance,
  opts: { logger: Logger },
): Promise<void> {
  const { logger } = opts;
  const db = getDb();

  // ── POST /api/v1/auth/register ────────────────────────────────────────────
  fastify.post("/api/v1/auth/register", async (request, reply) => {
    const parseResult = RegisterBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: { issues: parseResult.error.errors },
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { email, password, language } = parseResult.data;

    // Password strength validation
    const strengthResult = validatePasswordStrength(password);
    if (!strengthResult.valid) {
      return reply.status(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Password does not meet strength requirements",
          details: { errors: strengthResult.errors },
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check duplicate email
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      await writeAuditLog({
        action: "auth.register.duplicate_email",
        ipAddress: request.ip,
        ...withUserAgent(request.headers["user-agent"]),
        success: false,
        failureReason: "Email already exists",
        metadata: { email },
      });
      return reply.status(409).send({
        success: false,
        error: {
          code: "AUTH_EMAIL_ALREADY_EXISTS",
          message: "An account with this email already exists",
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Email verification token (hex)
    const emailVerificationToken = randomBytes(32).toString("hex");

    // Insert user
    const [newUser] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        language,
        plan: "free",
        emailVerified: false,
        emailVerificationToken,
      })
      .returning();

    if (!newUser) {
      throw new Error("Failed to create user — insert returned no rows");
    }

    // Generate tokens
    const accessToken = await generateAccessToken({
      id: newUser.id,
      email: newUser.email,
      plan: "free",
      language: newUser.language as "ru" | "pl" | "ua" | "en",
    });

    const refreshToken = generateRefreshToken();
    const family = crypto.randomUUID();

    await db.insert(refreshTokens).values({
      userId: newUser.id,
      tokenHash: refreshToken.hash,
      expiresAt: getRefreshTokenExpiry(),
      family,
      deviceInfo: {
        ...withUserAgent(request.headers["user-agent"]),
        ipAddress: request.ip,
      },
    });

    // Audit
    await writeAuditLog({
      userId: newUser.id,
      action: "auth.register",
      ipAddress: request.ip,
      ...withUserAgent(request.headers["user-agent"]),
      success: true,
    });

    // Publish NATS event
    const event: UserRegisteredEvent = {
      eventId: asEventId(crypto.randomUUID()),
      occurredAt: new Date().toISOString(),
      correlationId: asCorrelationId(crypto.randomUUID()),
      source: "auth-service",
      schemaVersion: 1,
      type: "user.registered",
      payload: {
        userId: asUserId(newUser.id),
        email: newUser.email,
        name: newUser.email.split("@")[0] ?? newUser.email,
        language: newUser.language as "ru" | "pl" | "ua" | "en",
        plan: "free",
        organizationId: null,
        registeredVia: "email",
        emailVerificationRequired: true,
      },
    };

    try {
      await publishUserRegistered(event, logger);
    } catch (err) {
      // Non-fatal: log and continue — user is already created
      logger.error({ err, userId: newUser.id }, "Failed to publish user.registered event");
    }

    logger.info({ userId: newUser.id, email: newUser.email }, "User registered");

    return reply.status(201).send({
      success: true,
      data: {
        accessToken,
        refreshToken: refreshToken.raw,
        user: toSafeUser(newUser),
      },
    });
  });

  // ── POST /api/v1/auth/login ───────────────────────────────────────────────
  fastify.post(
    "/api/v1/auth/login",
    { preHandler: [loginRateLimitMiddleware] },
    async (request, reply) => {
      const parseResult = LoginBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: { issues: parseResult.error.errors },
            timestamp: new Date().toISOString(),
          },
        });
      }

      const { email, password } = parseResult.data;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      const isValid =
        user !== undefined &&
        user.passwordHash !== null &&
        (await verifyPassword(password, user.passwordHash));

      if (!isValid) {
        await writeAuditLog({
          ...(user?.id !== undefined ? { userId: user.id } : {}),
          action: "auth.login.failed",
          ipAddress: request.ip,
          ...withUserAgent(request.headers["user-agent"]),
          success: false,
          failureReason: user === undefined ? "User not found" : "Invalid password",
          metadata: { email },
        });

        return reply.status(401).send({
          success: false,
          error: {
            code: "AUTH_INVALID_CREDENTIALS",
            message: "Invalid email or password",
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Successful login — reset rate limit for this IP
      await resetLoginRateLimit(request.ip);

      // Update lastLoginAt
      await db
        .update(users)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, user.id));

      const accessToken = await generateAccessToken({
        id: user.id,
        email: user.email,
        plan: user.plan as "free" | "pro" | "business",
        language: user.language as "ru" | "pl" | "ua" | "en",
      });

      const refreshToken = generateRefreshToken();
      const family = crypto.randomUUID();

      await db.insert(refreshTokens).values({
        userId: user.id,
        tokenHash: refreshToken.hash,
        expiresAt: getRefreshTokenExpiry(),
        family,
        deviceInfo: {
          ...withUserAgent(request.headers["user-agent"]),
          ipAddress: request.ip,
        },
      });

      await writeAuditLog({
        userId: user.id,
        action: "auth.login",
        ipAddress: request.ip,
        ...withUserAgent(request.headers["user-agent"]),
        success: true,
      });

      logger.info({ userId: user.id }, "User logged in");

      return reply.status(200).send({
        success: true,
        data: {
          accessToken,
          refreshToken: refreshToken.raw,
        },
      });
    },
  );

  // ── POST /api/v1/auth/logout ──────────────────────────────────────────────
  fastify.post(
    "/api/v1/auth/logout",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const userId = request.user?.sub;
      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: "AUTH_UNAUTHORIZED",
            message: "Unauthorized",
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Revoke all refresh tokens for this user (all devices)
      await db
        .update(refreshTokens)
        .set({ revoked: true, revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.revoked, false)));

      await writeAuditLog({
        userId,
        action: "auth.logout",
        ipAddress: request.ip,
        ...withUserAgent(request.headers["user-agent"]),
        success: true,
      });

      logger.info({ userId }, "User logged out");

      return reply.status(204).send();
    },
  );

  // ── POST /api/v1/auth/refresh ─────────────────────────────────────────────
  fastify.post("/api/v1/auth/refresh", async (request, reply) => {
    const parseResult = RefreshBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: { issues: parseResult.error.errors },
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { refreshToken: rawToken } = parseResult.data;
    const tokenHash = hashRefreshToken(rawToken);

    // Find token in DB
    const [storedToken] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    if (!storedToken) {
      return reply.status(401).send({
        success: false,
        error: {
          code: "AUTH_TOKEN_INVALID",
          message: "Invalid refresh token",
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Refresh Token Rotation: detect reuse — if token is already revoked,
    // revoke the entire family (possible token theft)
    if (storedToken.revoked) {
      logger.warn(
        { userId: storedToken.userId, family: storedToken.family },
        "Refresh token reuse detected — revoking entire family",
      );

      await db
        .update(refreshTokens)
        .set({ revoked: true, revokedAt: new Date() })
        .where(eq(refreshTokens.family, storedToken.family));

      await writeAuditLog({
        userId: storedToken.userId,
        action: "auth.refresh.token_reuse_detected",
        ipAddress: request.ip,
        ...withUserAgent(request.headers["user-agent"]),
        success: false,
        failureReason: "Refresh token reuse detected",
      });

      return reply.status(401).send({
        success: false,
        error: {
          code: "AUTH_TOKEN_INVALID",
          message: "Refresh token has been revoked",
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check expiry
    if (storedToken.expiresAt < new Date()) {
      return reply.status(401).send({
        success: false,
        error: {
          code: "AUTH_TOKEN_EXPIRED",
          message: "Refresh token has expired",
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Revoke old token
    await db
      .update(refreshTokens)
      .set({ revoked: true, revokedAt: new Date() })
      .where(eq(refreshTokens.id, storedToken.id));

    // Get user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, storedToken.userId))
      .limit(1);

    if (!user) {
      return reply.status(401).send({
        success: false,
        error: {
          code: "AUTH_USER_NOT_FOUND",
          message: "User not found",
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Issue new token pair (same family — rotation chain)
    const accessToken = await generateAccessToken({
      id: user.id,
      email: user.email,
      plan: user.plan as "free" | "pro" | "business",
      language: user.language as "ru" | "pl" | "ua" | "en",
    });

    const newRefreshToken = generateRefreshToken();

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: newRefreshToken.hash,
      expiresAt: getRefreshTokenExpiry(),
      family: storedToken.family, // same family — maintain rotation chain
      deviceInfo: {
        ...withUserAgent(request.headers["user-agent"]),
        ipAddress: request.ip,
      },
    });

    logger.info({ userId: user.id }, "Refresh token rotated");

    return reply.status(200).send({
      success: true,
      data: {
        accessToken,
        refreshToken: newRefreshToken.raw,
      },
    });
  });

  // ── POST /api/v1/auth/forgot-password ────────────────────────────────────
  fastify.post("/api/v1/auth/forgot-password", async (request, reply) => {
    const parseResult = ForgotPasswordBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: { issues: parseResult.error.errors },
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { email } = parseResult.data;

    // Always return 200 — never leak whether email exists
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (user) {
      const resetTokenRaw = randomBytes(32).toString("hex");
      const resetTokenHash = createHash("sha256").update(resetTokenRaw).digest("hex");
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db
        .update(users)
        .set({
          passwordResetToken: resetTokenHash,
          passwordResetExpires: resetExpires,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // TODO: Send resetTokenRaw to user via email (Resend)
      logger.info(
        { userId: user.id },
        "Password reset token generated and queued for delivery",
      );

      await writeAuditLog({
        userId: user.id,
        action: "auth.forgot_password",
        ipAddress: request.ip,
        ...withUserAgent(request.headers["user-agent"]),
        success: true,
      });
    }

    return reply.status(200).send({
      success: true,
      data: {
        message: "If an account with that email exists, a password reset link has been sent.",
      },
    });
  });

  // ── POST /api/v1/auth/reset-password ─────────────────────────────────────
  fastify.post("/api/v1/auth/reset-password", async (request, reply) => {
    const parseResult = ResetPasswordBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: { issues: parseResult.error.errors },
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { token, password } = parseResult.data;

    const strengthResult = validatePasswordStrength(password);
    if (!strengthResult.valid) {
      return reply.status(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Password does not meet strength requirements",
          details: { errors: strengthResult.errors },
          timestamp: new Date().toISOString(),
        },
      });
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.passwordResetToken, tokenHash))
      .limit(1);

    if (
      !user ||
      !user.passwordResetExpires ||
      user.passwordResetExpires < new Date()
    ) {
      return reply.status(400).send({
        success: false,
        error: {
          code: "AUTH_TOKEN_INVALID",
          message: "Invalid or expired password reset token",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const passwordHash = await hashPassword(password);

    await db
      .update(users)
      .set({
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // Revoke all refresh tokens (force re-login on all devices)
    await db
      .update(refreshTokens)
      .set({ revoked: true, revokedAt: new Date() })
      .where(eq(refreshTokens.userId, user.id));

    await writeAuditLog({
      userId: user.id,
      action: "auth.reset_password",
      ipAddress: request.ip,
      ...withUserAgent(request.headers["user-agent"]),
      success: true,
    });

    logger.info({ userId: user.id }, "Password reset successful");

    return reply.status(200).send({
      success: true,
      data: { message: "Password has been reset successfully." },
    });
  });

  // ── GET /api/v1/auth/me ───────────────────────────────────────────────────
  fastify.get(
    "/api/v1/auth/me",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const userId = request.user?.sub;
      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: "AUTH_UNAUTHORIZED",
            message: "Unauthorized",
            timestamp: new Date().toISOString(),
          },
        });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: {
            code: "AUTH_USER_NOT_FOUND",
            message: "User not found",
            timestamp: new Date().toISOString(),
          },
        });
      }

      return reply.status(200).send({
        success: true,
        data: { user: toSafeUser(user) },
      });
    },
  );

  // ── POST /api/v1/auth/verify-vat ─────────────────────────────────────────
  // Validates a VAT number against the EU VIES registry.
  // Body:     { countryCode: string, vatNumber: string }
  // Response: { valid: boolean, name?: string, address?: string, requestDate: string }
  fastify.post("/api/v1/auth/verify-vat", async (request, reply) => {
    const parseResult = ViesRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: { issues: parseResult.error.errors },
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { countryCode, vatNumber } = parseResult.data;

    try {
      const result = await checkVatNumber({ countryCode, vatNumber });

      return reply.status(200).send({
        success: true,
        data: {
          valid: result.valid,
          ...(result.name !== undefined ? { name: result.name } : {}),
          ...(result.address !== undefined ? { address: result.address } : {}),
          requestDate: result.requestDate,
        },
      });
    } catch (err) {
      if (err instanceof ViesValidationError) {
        return reply.status(422).send({
          success: false,
          error: {
            code: "VIES_VALIDATION_ERROR",
            message: err.message,
            timestamp: new Date().toISOString(),
          },
        });
      }

      if (err instanceof ViesServiceUnavailableError) {
        return reply.status(503).send({
          success: false,
          error: {
            code: "VIES_SERVICE_UNAVAILABLE",
            message: "VIES service is currently unavailable. Please try again later.",
            timestamp: new Date().toISOString(),
          },
        });
      }

      logger.error(
        { err, countryCode, vatNumber },
        "Unexpected error during VAT verification",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred during VAT verification",
          timestamp: new Date().toISOString(),
        },
      });
    }
  });
}
