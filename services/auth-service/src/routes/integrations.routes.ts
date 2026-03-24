// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — auth-service: Integrations / API-keys routes
// All routes require Bearer JWT authentication.
//
// GET    /api/v1/auth/integrations
// PUT    /api/v1/auth/integrations/:service
// DELETE /api/v1/auth/integrations/:service
// POST   /api/v1/auth/integrations/:service/test
// GET    /api/v1/auth/integrations/allegro/authorize
// POST   /api/v1/auth/integrations/allegro/callback
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getRedis } from "../services/redis.service.js";
import { getDb } from "../db/client.js";
import { userApiKeys } from "../db/schema.js";
import { authenticate } from "../middleware/authenticate.js";
import { env } from "../config/env.js";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// Service enum
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_ENUM = z.enum([
  "allegro",
  "google_search",
  "openai",
  "stripe",
  "serpapi",
]);

type ServiceName = z.infer<typeof SERVICE_ENUM>;

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────────

const ServiceParamSchema = z.object({
  service: SERVICE_ENUM,
});

const SaveKeysBodySchema = z.object({
  keys: z
    .object({
      apiKey: z.string().optional(),
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      webhookSecret: z.string().optional(),
      searchEngineId: z.string().optional(),
      accessToken: z.string().optional(),
      refreshToken: z.string().optional(),
    })
    .passthrough(),
});

const AllegroCallbackBodySchema = z.object({
  code: z.string().min(1, "code is required"),
  state: z.string().min(1, "state is required"),
});

// ─────────────────────────────────────────────────────────────────────────────
// AES-256-GCM encryption helpers
// ─────────────────────────────────────────────────────────────────────────────

function encrypt(plaintext: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    iv,
  );
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted}`;
}

function decrypt(encryptedBlob: string, key: string): string {
  const parts = encryptedBlob.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted blob format");
  }
  const [ivB64, tagB64, data] = parts as [string, string, string];
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  let decrypted = decipher.update(data, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mask a key for display: "sk-...●●●●ab12"
// ─────────────────────────────────────────────────────────────────────────────

function maskKey(rawKey: string): string {
  if (rawKey.length <= 8) return "●●●●●●●●";
  const prefix = rawKey.slice(0, 4);
  const suffix = rawKey.slice(-4);
  return `${prefix}●●●●${suffix}`;
}

function extractPrimaryKey(
  keys: Record<string, unknown>,
): string {
  const candidates = [
    "apiKey",
    "accessToken",
    "clientId",
  ] as const;
  for (const k of candidates) {
    const v = keys[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  // Fall back to first string value found
  for (const v of Object.values(keys)) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Allegro OAuth helpers
// ─────────────────────────────────────────────────────────────────────────────

const ALLEGRO_AUTH_URL = "https://allegro.pl/auth/oauth/authorize";
const ALLEGRO_TOKEN_URL = "https://allegro.pl/auth/oauth/token";

// ─────────────────────────────────────────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────────────────────────────────────────

export async function integrationsRoutes(
  fastify: FastifyInstance,
  opts: { logger: Logger },
): Promise<void> {
  const { logger } = opts;
  const db = getDb();
  const encryptionKey = env.ENCRYPTION_KEY;

  // ── GET /api/v1/auth/integrations ─────────────────────────────────────────
  fastify.get(
    "/api/v1/auth/integrations",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const userId = request.user?.sub;
      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: { code: "AUTH_UNAUTHORIZED", message: "Unauthorized", timestamp: new Date().toISOString() },
        });
      }

      const rows = await db
        .select()
        .from(userApiKeys)
        .where(eq(userApiKeys.userId, userId));

      const integrations = rows.map((row) => {
        let maskedKey = "●●●●●●●●";
        try {
          const plaintext = decrypt(row.encryptedData, encryptionKey);
          const keys = JSON.parse(plaintext) as Record<string, unknown>;
          const primary = extractPrimaryKey(keys);
          if (primary.length > 0) maskedKey = maskKey(primary);
        } catch {
          // If decryption fails, return masked placeholder
        }

        return {
          service: row.service,
          isActive: row.isActive,
          metadata: row.metadata,
          maskedKey,
          createdAt: row.createdAt,
        };
      });

      return reply.status(200).send({ success: true, data: { integrations } });
    },
  );

  // ── PUT /api/v1/auth/integrations/:service ────────────────────────────────
  fastify.put(
    "/api/v1/auth/integrations/:service",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const userId = request.user?.sub;
      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: { code: "AUTH_UNAUTHORIZED", message: "Unauthorized", timestamp: new Date().toISOString() },
        });
      }

      const paramResult = ServiceParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid service name",
            details: { issues: paramResult.error.errors },
            timestamp: new Date().toISOString(),
          },
        });
      }

      const bodyResult = SaveKeysBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: { issues: bodyResult.error.errors },
            timestamp: new Date().toISOString(),
          },
        });
      }

      const { service } = paramResult.data;
      const { keys } = bodyResult.data;

      const encryptedData = encrypt(JSON.stringify(keys), encryptionKey);
      const primary = extractPrimaryKey(keys as Record<string, unknown>);
      const maskedKey = primary.length > 0 ? maskKey(primary) : "●●●●●●●●";

      // Upsert
      const existing = await db
        .select({ id: userApiKeys.id })
        .from(userApiKeys)
        .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.service, service)))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(userApiKeys)
          .set({ encryptedData, isActive: true, updatedAt: new Date() })
          .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.service, service)));
      } else {
        await db.insert(userApiKeys).values({
          userId,
          service,
          encryptedData,
          isActive: true,
        });
      }

      logger.info({ userId, service }, "Integration keys saved");

      return reply.status(200).send({ success: true, service, maskedKey });
    },
  );

  // ── DELETE /api/v1/auth/integrations/:service ─────────────────────────────
  fastify.delete(
    "/api/v1/auth/integrations/:service",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const userId = request.user?.sub;
      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: { code: "AUTH_UNAUTHORIZED", message: "Unauthorized", timestamp: new Date().toISOString() },
        });
      }

      const paramResult = ServiceParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid service name",
            details: { issues: paramResult.error.errors },
            timestamp: new Date().toISOString(),
          },
        });
      }

      const { service } = paramResult.data;

      await db
        .delete(userApiKeys)
        .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.service, service)));

      logger.info({ userId, service }, "Integration deleted");

      return reply.status(200).send({ success: true });
    },
  );

  // ── POST /api/v1/auth/integrations/:service/test ──────────────────────────
  fastify.post(
    "/api/v1/auth/integrations/:service/test",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const userId = request.user?.sub;
      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: { code: "AUTH_UNAUTHORIZED", message: "Unauthorized", timestamp: new Date().toISOString() },
        });
      }

      const paramResult = ServiceParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid service name",
            details: { issues: paramResult.error.errors },
            timestamp: new Date().toISOString(),
          },
        });
      }

      const { service } = paramResult.data;

      const [row] = await db
        .select()
        .from(userApiKeys)
        .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.service, service)))
        .limit(1);

      if (!row) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: "Integration not found", timestamp: new Date().toISOString() },
        });
      }

      let keys: Record<string, unknown>;
      try {
        const plaintext = decrypt(row.encryptedData, encryptionKey);
        keys = JSON.parse(plaintext) as Record<string, unknown>;
      } catch (err) {
        logger.warn({ err, userId, service }, "Failed to decrypt integration keys for test");
        return reply.status(200).send({ success: true, working: false, error: "Failed to decrypt stored keys" });
      }

      const { working, error: testError } = await testIntegration(service, keys);

      logger.info({ userId, service, working }, "Integration test completed");

      return reply.status(200).send({ success: true, working, ...(testError !== undefined ? { error: testError } : {}) });
    },
  );

  // ── GET /api/v1/auth/integrations/allegro/authorize ───────────────────────
  // Must be registered BEFORE the generic :service routes to avoid capture
  fastify.get(
    "/api/v1/auth/integrations/allegro/authorize",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const userId = request.user?.sub;
      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: { code: "AUTH_UNAUTHORIZED", message: "Unauthorized", timestamp: new Date().toISOString() },
        });
      }

      // Try to read clientId stored by the user, fall back to env-level client id
      let clientId: string | undefined;

      const [row] = await db
        .select()
        .from(userApiKeys)
        .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.service, "allegro")))
        .limit(1);

      if (row) {
        try {
          const plaintext = decrypt(row.encryptedData, encryptionKey);
          const stored = JSON.parse(plaintext) as Record<string, unknown>;
          if (typeof stored["clientId"] === "string" && stored["clientId"].length > 0) {
            clientId = stored["clientId"];
          }
        } catch {
          // Fall through to env fallback
        }
      }

      if (!clientId) {
        clientId = process.env["ALLEGRO_CLIENT_ID"];
      }

      if (!clientId) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "MISSING_CLIENT_ID",
            message: "Allegro client_id not configured. Save your Allegro OAuth credentials first.",
            timestamp: new Date().toISOString(),
          },
        });
      }

      const redirectUri = `${env.APP_URL}/api/v1/auth/integrations/allegro/callback`;

      // Generate cryptographically random state and store in Redis with 10 min TTL
      const state = randomBytes(32).toString("hex");
      const redis = getRedis();
      await redis.set(`oauth_state:${userId}`, state, { EX: 600 });

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        prompt: "confirm",
        state,
      });

      const authUrl = `${ALLEGRO_AUTH_URL}?${params.toString()}`;

      return reply.status(200).send({ success: true, authUrl });
    },
  );

  // ── POST /api/v1/auth/integrations/allegro/callback ──────────────────────
  fastify.post(
    "/api/v1/auth/integrations/allegro/callback",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const userId = request.user?.sub;
      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: { code: "AUTH_UNAUTHORIZED", message: "Unauthorized", timestamp: new Date().toISOString() },
        });
      }

      const bodyResult = AllegroCallbackBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: { issues: bodyResult.error.errors },
            timestamp: new Date().toISOString(),
          },
        });
      }

      const { code, state } = bodyResult.data;

      // Validate OAuth state parameter against Redis
      const redis = getRedis();
      const expectedState = await redis.get(`oauth_state:${userId}`);
      if (!expectedState || state !== expectedState) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "INVALID_OAUTH_STATE",
            message: "Invalid OAuth state parameter",
            timestamp: new Date().toISOString(),
          },
        });
      }
      await redis.del(`oauth_state:${userId}`);

      // Read stored clientId / clientSecret
      const [row] = await db
        .select()
        .from(userApiKeys)
        .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.service, "allegro")))
        .limit(1);

      let clientId = process.env["ALLEGRO_CLIENT_ID"] ?? "";
      let clientSecret = process.env["ALLEGRO_CLIENT_SECRET"] ?? "";

      if (row) {
        try {
          const plaintext = decrypt(row.encryptedData, encryptionKey);
          const stored = JSON.parse(plaintext) as Record<string, unknown>;
          if (typeof stored["clientId"] === "string" && stored["clientId"].length > 0) {
            clientId = stored["clientId"];
          }
          if (typeof stored["clientSecret"] === "string" && stored["clientSecret"].length > 0) {
            clientSecret = stored["clientSecret"];
          }
        } catch {
          // Fall through
        }
      }

      if (!clientId || !clientSecret) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "MISSING_CREDENTIALS",
            message: "Allegro OAuth credentials not configured",
            timestamp: new Date().toISOString(),
          },
        });
      }

      const redirectUri = `${env.APP_URL}/api/v1/auth/integrations/allegro/callback`;

      // Exchange code for tokens
      let tokenData: {
        access_token: string;
        refresh_token: string;
        expires_in: number;
        token_type: string;
      };

      try {
        const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
        const tokenRes = await fetch(ALLEGRO_TOKEN_URL, {
          method: "POST",
          headers: {
            Authorization: `Basic ${basicAuth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
          }),
        });

        if (!tokenRes.ok) {
          const errBody = await tokenRes.text();
          logger.warn({ userId, status: tokenRes.status, errBody }, "Allegro token exchange failed");
          return reply.status(400).send({
            success: false,
            error: {
              code: "ALLEGRO_TOKEN_EXCHANGE_FAILED",
              message: "Failed to exchange authorization code for tokens",
              timestamp: new Date().toISOString(),
            },
          });
        }

        tokenData = (await tokenRes.json()) as typeof tokenData;
      } catch (err) {
        logger.error({ err, userId }, "Network error during Allegro token exchange");
        return reply.status(502).send({
          success: false,
          error: {
            code: "ALLEGRO_NETWORK_ERROR",
            message: "Network error communicating with Allegro",
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Fetch seller name from /me
      let sellerName = "Unknown";
      try {
        const meRes = await fetch("https://api.allegro.pl/me", {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "Accept": "application/vnd.allegro.public.v1+json",
          },
        });
        if (meRes.ok) {
          const meData = (await meRes.json()) as { login?: string };
          if (typeof meData.login === "string") sellerName = meData.login;
        }
      } catch {
        // Non-fatal — still store tokens
      }

      // Build keys payload merging with existing credentials
      const existingKeys: Record<string, unknown> = row
        ? (() => {
            try {
              const plaintext = decrypt(row.encryptedData, encryptionKey);
              return JSON.parse(plaintext) as Record<string, unknown>;
            } catch {
              return {};
            }
          })()
        : {};

      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1_000).toISOString();

      const updatedKeys = {
        ...existingKeys,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
      };

      const encryptedData = encrypt(JSON.stringify(updatedKeys), encryptionKey);
      const metadata = {
        displayName: sellerName,
        connectedEmail: sellerName,
        expiresAt,
      };

      if (row) {
        await db
          .update(userApiKeys)
          .set({ encryptedData, metadata, isActive: true, updatedAt: new Date() })
          .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.service, "allegro")));
      } else {
        await db.insert(userApiKeys).values({
          userId,
          service: "allegro",
          encryptedData,
          metadata,
          isActive: true,
        });
      }

      logger.info({ userId, sellerName }, "Allegro OAuth connected");

      return reply.status(200).send({ success: true, connectedAs: sellerName });
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Integration test runners
// ─────────────────────────────────────────────────────────────────────────────

interface TestResult {
  working: boolean;
  error?: string;
}

async function testIntegration(
  service: ServiceName,
  keys: Record<string, unknown>,
): Promise<TestResult> {
  try {
    switch (service) {
      case "openai":
        return await testOpenAi(keys);
      case "serpapi":
        return await testSerpApi(keys);
      case "google_search":
        return await testGoogleSearch(keys);
      case "allegro":
        return await testAllegro(keys);
      case "stripe":
        return await testStripe(keys);
      default:
        return { working: false, error: "Unknown service" };
    }
  } catch (err) {
    return { working: false, error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

async function testOpenAi(keys: Record<string, unknown>): Promise<TestResult> {
  const apiKey = keys["apiKey"];
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    return { working: false, error: "apiKey not set" };
  }
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.ok) return { working: true };
  const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
  return { working: false, error: body.error?.message ?? `HTTP ${res.status}` };
}

async function testSerpApi(keys: Record<string, unknown>): Promise<TestResult> {
  const apiKey = keys["apiKey"];
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    return { working: false, error: "apiKey not set" };
  }
  const url = `https://serpapi.com/search?q=test&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (res.ok) return { working: true };
  const body = await res.json().catch(() => ({})) as { error?: string };
  return { working: false, error: body.error ?? `HTTP ${res.status}` };
}

async function testGoogleSearch(keys: Record<string, unknown>): Promise<TestResult> {
  const apiKey = keys["apiKey"];
  const cx = keys["searchEngineId"];
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    return { working: false, error: "apiKey not set" };
  }
  if (typeof cx !== "string" || cx.length === 0) {
    return { working: false, error: "searchEngineId (cx) not set" };
  }
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=test`;
  const res = await fetch(url);
  if (res.ok) return { working: true };
  const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
  return { working: false, error: body.error?.message ?? `HTTP ${res.status}` };
}

async function testAllegro(keys: Record<string, unknown>): Promise<TestResult> {
  const accessToken = keys["accessToken"];
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return { working: false, error: "accessToken not set — connect via OAuth first" };
  }
  const res = await fetch("https://api.allegro.pl/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.allegro.public.v1+json",
    },
  });
  if (res.ok) return { working: true };
  return { working: false, error: `HTTP ${res.status}` };
}

async function testStripe(keys: Record<string, unknown>): Promise<TestResult> {
  const secretKey = keys["apiKey"];
  if (typeof secretKey !== "string" || secretKey.length === 0) {
    return { working: false, error: "apiKey (secret key) not set" };
  }
  const res = await fetch("https://api.stripe.com/v1/balance", {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (res.ok) return { working: true };
  const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
  return { working: false, error: body.error?.message ?? `HTTP ${res.status}` };
}
