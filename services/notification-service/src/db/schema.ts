// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — notification-service: Drizzle ORM PostgreSQL schema
// ─────────────────────────────────────────────────────────────────────────────

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { Language } from "@ecompilot/shared-types";

// ─────────────────────────────────────────────────────────────────────────────
// Per-event-type channel overrides stored in notification_preferences.channels
// ─────────────────────────────────────────────────────────────────────────────

export type EventChannelConfig = {
  readonly email?: boolean;
  readonly push?: boolean;
  readonly inApp?: boolean;
};

export type NotificationChannels = {
  readonly "user.registered"?: EventChannelConfig;
  readonly "billing.payment.succeeded"?: EventChannelConfig;
  readonly "billing.payment.failed"?: EventChannelConfig;
  readonly "analytics.niche.analysis.complete"?: EventChannelConfig;
  readonly "community.post.reply.created"?: EventChannelConfig;
  readonly "content.generation.complete"?: EventChannelConfig;
  readonly [eventType: string]: EventChannelConfig | undefined;
};

// ─────────────────────────────────────────────────────────────────────────────
// notification_preferences
// ─────────────────────────────────────────────────────────────────────────────

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().unique(),
    emailEnabled: boolean("email_enabled").notNull().default(true),
    pushEnabled: boolean("push_enabled").notNull().default(true),
    inAppEnabled: boolean("in_app_enabled").notNull().default(true),
    /** Per-event-type channel overrides — null keys mean use global setting */
    channels: jsonb("channels").$type<NotificationChannels>().default({}),
    language: text("language").notNull().default("ru").$type<Language>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("notification_preferences_user_id_idx").on(table.userId),
  }),
);

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// in_app_notifications
// ─────────────────────────────────────────────────────────────────────────────

export type InAppNotificationType =
  | "niche_analysis_complete"
  | "content_generation_complete"
  | "payment_succeeded"
  | "payment_failed"
  | "community_reply"
  | "system";

export const inAppNotifications = pgTable(
  "in_app_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    type: text("type").notNull().$type<InAppNotificationType>(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("in_app_notifications_user_id_idx").on(table.userId),
    isReadIdx: index("in_app_notifications_is_read_idx").on(table.isRead),
    userIdIsReadIdx: index("in_app_notifications_user_id_is_read_idx").on(
      table.userId,
      table.isRead,
    ),
  }),
);

export type InAppNotification = typeof inAppNotifications.$inferSelect;
export type NewInAppNotification = typeof inAppNotifications.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// fcm_tokens
// ─────────────────────────────────────────────────────────────────────────────

export type DeviceInfo = {
  readonly platform?: "ios" | "android" | "web";
  readonly deviceModel?: string;
  readonly appVersion?: string;
  readonly osVersion?: string;
};

export const fcmTokens = pgTable(
  "fcm_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    token: text("token").notNull().unique(),
    deviceInfo: jsonb("device_info").$type<DeviceInfo>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("fcm_tokens_user_id_idx").on(table.userId),
    tokenIdx: uniqueIndex("fcm_tokens_token_idx").on(table.token),
  }),
);

export type FcmToken = typeof fcmTokens.$inferSelect;
export type NewFcmToken = typeof fcmTokens.$inferInsert;
