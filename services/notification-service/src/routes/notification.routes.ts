// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — notification-service: Notification REST routes
//
// GET  /api/v1/notifications/preferences          — get preferences
// PUT  /api/v1/notifications/preferences          — update preferences
// GET  /api/v1/notifications/in-app               — in-app notifications (paginated)
// POST /api/v1/notifications/in-app/read-all      — mark all read
// POST /api/v1/notifications/fcm-token            — save FCM token
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate.js";
import {
  getOrCreatePreferences,
  updatePreferences,
  upsertFcmToken,
} from "../services/preferences.service.js";
import {
  listInAppNotifications,
  markAllNotificationsRead,
} from "../services/inapp.service.js";
import type { Language } from "@ecompilot/shared-types";
import { createSuccessResponse, createServiceError, createErrorResponse } from "@ecompilot/shared-types";

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas for request validation
// ─────────────────────────────────────────────────────────────────────────────

const UpdatePreferencesBodySchema = z.object({
  emailEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  language: z.enum(["ru", "pl", "ua", "en"]).optional(),
  channels: z
    .record(
      z.string(),
      z.object({
        email: z.boolean().optional(),
        push: z.boolean().optional(),
        inApp: z.boolean().optional(),
      }),
    )
    .optional(),
});

const InAppQuerySchema = z.object({
  page: z
    .string()
    .default("1")
    .transform((v) => Math.max(1, parseInt(v, 10)))
    .pipe(z.number().int().positive()),
  limit: z
    .string()
    .default("20")
    .transform((v) => Math.min(100, Math.max(1, parseInt(v, 10))))
    .pipe(z.number().int().positive()),
});

const FcmTokenBodySchema = z.object({
  token: z.string().min(1),
  deviceInfo: z
    .object({
      platform: z.enum(["ios", "android", "web"]).optional(),
      deviceModel: z.string().optional(),
      appVersion: z.string().optional(),
      osVersion: z.string().optional(),
    })
    .optional()
    .default({}),
});

// ─────────────────────────────────────────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────────────────────────────────────────

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook("preHandler", authenticate);

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/v1/notifications/preferences
  // ─────────────────────────────────────────────────────────────────────────

  app.get("/preferences", async (request, reply) => {
    const user = request.user;
    if (user === undefined) {
      return reply.status(401).send(
        createErrorResponse(
          createServiceError("AUTH_UNAUTHORIZED", "Authentication required"),
        ),
      );
    }

    const prefs = await getOrCreatePreferences(user.sub, user.language as Language);
    return reply.status(200).send(createSuccessResponse(prefs));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/v1/notifications/preferences
  // ─────────────────────────────────────────────────────────────────────────

  app.put("/preferences", async (request, reply) => {
    const user = request.user;
    if (user === undefined) {
      return reply.status(401).send(
        createErrorResponse(
          createServiceError("AUTH_UNAUTHORIZED", "Authentication required"),
        ),
      );
    }

    const bodyResult = UpdatePreferencesBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send(
        createErrorResponse(
          createServiceError("VALIDATION_ERROR", "Invalid request body", {
            issues: bodyResult.error.errors,
          }),
        ),
      );
    }

    // Strip undefined values to satisfy exactOptionalPropertyTypes
    const prefsInput = {
      ...(bodyResult.data.emailEnabled !== undefined ? { emailEnabled: bodyResult.data.emailEnabled } : {}),
      ...(bodyResult.data.pushEnabled !== undefined ? { pushEnabled: bodyResult.data.pushEnabled } : {}),
      ...(bodyResult.data.inAppEnabled !== undefined ? { inAppEnabled: bodyResult.data.inAppEnabled } : {}),
      ...(bodyResult.data.channels !== undefined ? { channels: bodyResult.data.channels as import("../db/schema.js").NotificationChannels } : {}),
      ...(bodyResult.data.language !== undefined ? { language: bodyResult.data.language } : {}),
    };
    const updated = await updatePreferences(user.sub, prefsInput, request.log as unknown as import("pino").Logger);
    return reply.status(200).send(createSuccessResponse(updated));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/v1/notifications/in-app
  // ─────────────────────────────────────────────────────────────────────────

  app.get("/in-app", async (request, reply) => {
    const user = request.user;
    if (user === undefined) {
      return reply.status(401).send(
        createErrorResponse(
          createServiceError("AUTH_UNAUTHORIZED", "Authentication required"),
        ),
      );
    }

    const queryResult = InAppQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send(
        createErrorResponse(
          createServiceError("VALIDATION_ERROR", "Invalid query parameters", {
            issues: queryResult.error.errors,
          }),
        ),
      );
    }

    const { page, limit } = queryResult.data;
    const result = await listInAppNotifications({
      userId: user.sub,
      page,
      limit,
    });

    return reply.status(200).send(
      createSuccessResponse(result.items, {
        page: result.page,
        limit: result.limit,
        total: result.total,
        hasMore: result.hasMore,
      }),
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/v1/notifications/in-app/read-all
  // ─────────────────────────────────────────────────────────────────────────

  app.post("/in-app/read-all", async (request, reply) => {
    const user = request.user;
    if (user === undefined) {
      return reply.status(401).send(
        createErrorResponse(
          createServiceError("AUTH_UNAUTHORIZED", "Authentication required"),
        ),
      );
    }

    const updatedCount = await markAllNotificationsRead(user.sub, request.log as unknown as import("pino").Logger);
    return reply.status(200).send(createSuccessResponse({ updatedCount }));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/v1/notifications/fcm-token
  // ─────────────────────────────────────────────────────────────────────────

  app.post("/fcm-token", async (request, reply) => {
    const user = request.user;
    if (user === undefined) {
      return reply.status(401).send(
        createErrorResponse(
          createServiceError("AUTH_UNAUTHORIZED", "Authentication required"),
        ),
      );
    }

    const bodyResult = FcmTokenBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send(
        createErrorResponse(
          createServiceError("VALIDATION_ERROR", "Invalid request body", {
            issues: bodyResult.error.errors,
          }),
        ),
      );
    }

    const { token, deviceInfo } = bodyResult.data;
    // Strip undefined values to satisfy exactOptionalPropertyTypes on DeviceInfo
    const cleanDeviceInfo = {
      ...(deviceInfo.platform !== undefined ? { platform: deviceInfo.platform } : {}),
      ...(deviceInfo.deviceModel !== undefined ? { deviceModel: deviceInfo.deviceModel } : {}),
      ...(deviceInfo.appVersion !== undefined ? { appVersion: deviceInfo.appVersion } : {}),
      ...(deviceInfo.osVersion !== undefined ? { osVersion: deviceInfo.osVersion } : {}),
    };
    await upsertFcmToken(user.sub, token, cleanDeviceInfo, request.log as unknown as import("pino").Logger);

    return reply.status(201).send(createSuccessResponse({ registered: true }));
  });
}
