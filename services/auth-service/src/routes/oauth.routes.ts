// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — auth-service: OAuth routes (Google OAuth2)
// GET  /api/v1/oauth/google             — redirect to Google
// GET  /api/v1/oauth/google/callback    — exchange code, create/find user
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { users, refreshTokens } from "../db/schema.js";
import {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiry,
} from "../services/token.service.js";
import { publishUserRegistered } from "../services/nats.service.js";
import { env } from "../config/env.js";
import type { UserRegisteredEvent } from "@ecompilot/event-contracts";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build optional userAgent spread for exactOptionalPropertyTypes
// ─────────────────────────────────────────────────────────────────────────────

function withUserAgent(ua: string | undefined): { userAgent: string } | Record<never, never> {
  return ua !== undefined ? { userAgent: ua } : {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Branded ID helpers
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asEventId = (id: string): any => id;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asCorrelationId = (id: string): any => id;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asUserId = (id: string): any => id;

// ─────────────────────────────────────────────────────────────────────────────
// Google OAuth endpoints
// ─────────────────────────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

const GOOGLE_SCOPES = ["openid", "email", "profile"].join(" ");

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  id_token?: string;
  expires_in: number;
  scope: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  verified_email: boolean;
}

export async function oauthRoutes(
  fastify: FastifyInstance,
  opts: { logger: Logger },
): Promise<void> {
  const { logger } = opts;
  const db = getDb();

  // ── GET /api/v1/oauth/google ──────────────────────────────────────────────
  fastify.get("/api/v1/oauth/google", async (request, reply) => {
    const callbackUrl = `${env.APP_URL}/api/v1/oauth/google/callback`;

    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: callbackUrl,
      response_type: "code",
      scope: GOOGLE_SCOPES,
      access_type: "offline",
      prompt: "consent",
    });

    const redirectUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

    logger.info({ redirectUrl }, "Redirecting to Google OAuth");

    return reply.redirect(redirectUrl, 302);
  });

  // ── GET /api/v1/oauth/google/callback ─────────────────────────────────────
  fastify.get<{ Querystring: { code?: string; error?: string; state?: string } }>(
    "/api/v1/oauth/google/callback",
    async (request, reply) => {
      const { code, error } = request.query;

      if (error || !code) {
        logger.warn({ error, code }, "Google OAuth error or missing code");
        return reply.status(400).send({
          success: false,
          error: {
            code: "AUTH_TOKEN_INVALID",
            message: error ?? "OAuth authorization was denied",
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Exchange authorization code for tokens
      const callbackUrl = `${env.APP_URL}/api/v1/oauth/google/callback`;

      let googleTokens: GoogleTokenResponse;
      try {
        const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: callbackUrl,
            grant_type: "authorization_code",
          }),
        });

        if (!tokenResponse.ok) {
          const errBody = await tokenResponse.text();
          logger.error({ status: tokenResponse.status, body: errBody }, "Google token exchange failed");
          throw new Error(`Google token exchange failed: ${tokenResponse.status}`);
        }

        googleTokens = await tokenResponse.json() as GoogleTokenResponse;
      } catch (err) {
        logger.error({ err }, "Failed to exchange Google OAuth code");
        return reply.status(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to authenticate with Google",
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Get user info from Google
      let googleUser: GoogleUserInfo;
      try {
        const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
          headers: { Authorization: `Bearer ${googleTokens.access_token}` },
        });

        if (!userInfoResponse.ok) {
          throw new Error(`Google userinfo failed: ${userInfoResponse.status}`);
        }

        googleUser = await userInfoResponse.json() as GoogleUserInfo;
      } catch (err) {
        logger.error({ err }, "Failed to fetch Google user info");
        return reply.status(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to retrieve user information from Google",
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Find or create user
      let user: typeof users.$inferSelect | undefined;
      let isNewUser = false;

      // 1. Try to find by googleId
      const [byGoogleId] = await db
        .select()
        .from(users)
        .where(eq(users.googleId, googleUser.id))
        .limit(1);

      if (byGoogleId) {
        user = byGoogleId;
      } else {
        // 2. Try to find by email (link accounts)
        const [byEmail] = await db
          .select()
          .from(users)
          .where(eq(users.email, googleUser.email.toLowerCase()))
          .limit(1);

        if (byEmail) {
          // Link Google account to existing user
          const [updated] = await db
            .update(users)
            .set({
              googleId: googleUser.id,
              emailVerified: true,
              lastLoginAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(users.id, byEmail.id))
            .returning();
          user = updated;
        } else {
          // 3. Create new user
          const [created] = await db
            .insert(users)
            .values({
              email: googleUser.email.toLowerCase(),
              googleId: googleUser.id,
              emailVerified: googleUser.verified_email,
              language: "ru",
              plan: "free",
            })
            .returning();
          user = created;
          isNewUser = true;
        }
      }

      if (!user) {
        return reply.status(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create or retrieve user",
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Update lastLoginAt for existing users
      if (!isNewUser) {
        await db
          .update(users)
          .set({ lastLoginAt: new Date(), updatedAt: new Date() })
          .where(eq(users.id, user.id));
      }

      // Generate tokens
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
          platform: "google_oauth",
        },
      });

      // Publish NATS event for new users
      if (isNewUser) {
        const event: UserRegisteredEvent = {
          eventId: asEventId(crypto.randomUUID()),
          occurredAt: new Date().toISOString(),
          correlationId: asCorrelationId(crypto.randomUUID()),
          source: "auth-service",
          schemaVersion: 1,
          type: "user.registered",
          payload: {
            userId: asUserId(user.id),
            email: user.email,
            name: googleUser.name,
            language: user.language as "ru" | "pl" | "ua" | "en",
            plan: "free",
            organizationId: null,
            registeredVia: "google",
            emailVerificationRequired: false,
          },
        };

        try {
          await publishUserRegistered(event, logger);
        } catch (err) {
          logger.error({ err, userId: user.id }, "Failed to publish user.registered event (oauth)");
        }
      }

      logger.info({ userId: user.id, isNewUser }, "Google OAuth login successful");

      return reply.status(200).send({
        success: true,
        data: {
          accessToken,
          refreshToken: refreshToken.raw,
          user: {
            id: user.id,
            email: user.email,
            language: user.language,
            plan: user.plan,
            emailVerified: user.emailVerified,
          },
          isNewUser,
        },
      });
    },
  );
}
