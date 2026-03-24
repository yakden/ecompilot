// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — notification-service: Notification preferences service
// ─────────────────────────────────────────────────────────────────────────────

import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  notificationPreferences,
  fcmTokens,
  type NotificationPreference,
  type NewNotificationPreference,
  type NotificationChannels,
  type DeviceInfo,
} from "../db/schema.js";
import type { Language } from "@ecompilot/shared-types";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// Get or create notification preferences for a user
// ─────────────────────────────────────────────────────────────────────────────

export async function getOrCreatePreferences(
  userId: string,
  language: Language = "ru",
): Promise<NotificationPreference> {
  const db = getDb();

  const existing = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  if (existing[0] !== undefined) {
    return existing[0];
  }

  const newPref: NewNotificationPreference = {
    userId,
    emailEnabled: true,
    pushEnabled: true,
    inAppEnabled: true,
    channels: {},
    language,
  };

  const [created] = await db
    .insert(notificationPreferences)
    .values(newPref)
    .returning();

  if (created === undefined) {
    throw new Error("Failed to create notification preferences");
  }

  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// Update preferences
// ─────────────────────────────────────────────────────────────────────────────

export interface UpdatePreferencesInput {
  readonly emailEnabled?: boolean;
  readonly pushEnabled?: boolean;
  readonly inAppEnabled?: boolean;
  readonly channels?: NotificationChannels;
  readonly language?: Language;
}

export async function updatePreferences(
  userId: string,
  input: UpdatePreferencesInput,
  logger: Logger,
): Promise<NotificationPreference> {
  const db = getDb();

  // Ensure row exists first
  await getOrCreatePreferences(userId);

  const updates: Partial<typeof notificationPreferences.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.emailEnabled !== undefined) updates.emailEnabled = input.emailEnabled;
  if (input.pushEnabled !== undefined) updates.pushEnabled = input.pushEnabled;
  if (input.inAppEnabled !== undefined) updates.inAppEnabled = input.inAppEnabled;
  if (input.channels !== undefined) updates.channels = input.channels;
  if (input.language !== undefined) updates.language = input.language;

  const [updated] = await db
    .update(notificationPreferences)
    .set(updates)
    .where(eq(notificationPreferences.userId, userId))
    .returning();

  if (updated === undefined) {
    throw new Error("Failed to update notification preferences");
  }

  logger.info({ userId }, "Notification preferences updated");
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Check whether a specific channel is enabled for an event type
// ─────────────────────────────────────────────────────────────────────────────

export type NotificationChannel = "email" | "push" | "inApp";

export function isChannelEnabled(
  prefs: NotificationPreference,
  channel: NotificationChannel,
  eventType: string,
): boolean {
  // Check global toggle first
  const globalEnabled =
    channel === "email"
      ? prefs.emailEnabled
      : channel === "push"
        ? prefs.pushEnabled
        : prefs.inAppEnabled;

  if (!globalEnabled) return false;

  // Check per-event override
  const channelConfig = prefs.channels?.[eventType];
  if (channelConfig === undefined) return true;

  const override =
    channel === "email"
      ? channelConfig.email
      : channel === "push"
        ? channelConfig.push
        : channelConfig.inApp;

  return override !== false;
}

// ─────────────────────────────────────────────────────────────────────────────
// FCM token management
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertFcmToken(
  userId: string,
  token: string,
  deviceInfo: DeviceInfo,
  logger: Logger,
): Promise<void> {
  const db = getDb();

  await db
    .insert(fcmTokens)
    .values({
      userId,
      token,
      deviceInfo,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: fcmTokens.token,
      set: {
        userId,
        deviceInfo,
        updatedAt: new Date(),
      },
    });

  logger.info({ userId, tokenPrefix: token.slice(0, 10) + "..." }, "FCM token upserted");
}

export async function getFcmTokensForUser(userId: string): Promise<readonly string[]> {
  const db = getDb();

  const rows = await db
    .select({ token: fcmTokens.token })
    .from(fcmTokens)
    .where(eq(fcmTokens.userId, userId));

  return rows.map((r) => r.token);
}

export async function deleteFcmToken(token: string, logger: Logger): Promise<void> {
  const db = getDb();

  await db.delete(fcmTokens).where(eq(fcmTokens.token, token));

  logger.info({ tokenPrefix: token.slice(0, 10) + "..." }, "FCM token deleted");
}
