// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — notification-service: In-app notification service
// Persists to PostgreSQL; delivers in real-time via Socket.io
// ─────────────────────────────────────────────────────────────────────────────

import { eq, and, desc, count, sql } from "drizzle-orm";
import type { Server as SocketIOServer } from "socket.io";
import { getDb } from "../db/client.js";
import {
  inAppNotifications,
  type NewInAppNotification,
  type InAppNotification,
  type InAppNotificationType,
} from "../db/schema.js";
import type { Logger } from "pino";

// ─────────────────────────────────────────────────────────────────────────────
// Socket.io server reference — injected at startup
// ─────────────────────────────────────────────────────────────────────────────

let _io: SocketIOServer | null = null;

export function setSocketServer(io: SocketIOServer): void {
  _io = io;
}

// ─────────────────────────────────────────────────────────────────────────────
// Create and deliver an in-app notification
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateInAppNotificationInput {
  readonly userId: string;
  readonly type: InAppNotificationType;
  readonly title: string;
  readonly body: string;
  readonly data?: Record<string, unknown>;
}

export async function createInAppNotification(
  input: CreateInAppNotificationInput,
  logger: Logger,
): Promise<InAppNotification> {
  const db = getDb();

  const newNotif: NewInAppNotification = {
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    data: input.data ?? {},
    isRead: false,
  };

  const [created] = await db
    .insert(inAppNotifications)
    .values(newNotif)
    .returning();

  if (created === undefined) {
    throw new Error("Failed to insert in-app notification — no row returned");
  }

  logger.info(
    { notificationId: created.id, userId: input.userId, type: input.type },
    "In-app notification created",
  );

  // Real-time delivery via Socket.io if the user has an active connection
  if (_io !== null) {
    _io.to(`user:${input.userId}`).emit("notification", {
      id: created.id,
      type: created.type,
      title: created.title,
      body: created.body,
      data: created.data,
      isRead: created.isRead,
      createdAt: created.createdAt,
    });
  }

  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paginated list of in-app notifications for a user
// ─────────────────────────────────────────────────────────────────────────────

export interface ListInAppNotificationsOptions {
  readonly userId: string;
  readonly page: number;
  readonly limit: number;
}

export interface InAppNotificationsPage {
  readonly items: readonly InAppNotification[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly hasMore: boolean;
  readonly unreadCount: number;
}

export async function listInAppNotifications(
  options: ListInAppNotificationsOptions,
): Promise<InAppNotificationsPage> {
  const db = getDb();
  const { userId, page, limit } = options;
  const offset = (page - 1) * limit;

  const [items, totalResult, unreadResult] = await Promise.all([
    db
      .select()
      .from(inAppNotifications)
      .where(eq(inAppNotifications.userId, userId))
      .orderBy(desc(inAppNotifications.createdAt))
      .limit(limit)
      .offset(offset),

    db
      .select({ value: count() })
      .from(inAppNotifications)
      .where(eq(inAppNotifications.userId, userId)),

    db
      .select({ value: count() })
      .from(inAppNotifications)
      .where(
        and(
          eq(inAppNotifications.userId, userId),
          eq(inAppNotifications.isRead, false),
        ),
      ),
  ]);

  const total = totalResult[0]?.value ?? 0;
  const unreadCount = unreadResult[0]?.value ?? 0;

  return {
    items,
    total: Number(total),
    page,
    limit,
    hasMore: offset + items.length < Number(total),
    unreadCount: Number(unreadCount),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mark a single notification as read
// ─────────────────────────────────────────────────────────────────────────────

export async function markNotificationRead(
  notificationId: string,
  userId: string,
  logger: Logger,
): Promise<void> {
  const db = getDb();

  await db
    .update(inAppNotifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(inAppNotifications.id, notificationId),
        eq(inAppNotifications.userId, userId),
      ),
    );

  logger.info({ notificationId, userId }, "In-app notification marked as read");
}

// ─────────────────────────────────────────────────────────────────────────────
// Mark all notifications as read for a user
// ─────────────────────────────────────────────────────────────────────────────

export async function markAllNotificationsRead(
  userId: string,
  logger: Logger,
): Promise<number> {
  const db = getDb();

  const result = await db
    .update(inAppNotifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(inAppNotifications.userId, userId),
        eq(inAppNotifications.isRead, false),
      ),
    )
    .returning({ id: inAppNotifications.id });

  const updatedCount = result.length;

  logger.info({ userId, updatedCount }, "All in-app notifications marked as read");

  // Notify client via Socket.io
  if (_io !== null && updatedCount > 0) {
    _io.to(`user:${userId}`).emit("notifications:read-all");
  }

  return updatedCount;
}

// ─────────────────────────────────────────────────────────────────────────────
// Get unread count for a user (lightweight — for badge counters)
// ─────────────────────────────────────────────────────────────────────────────

export async function getUnreadCount(userId: string): Promise<number> {
  const db = getDb();

  const [result] = await db
    .select({ value: count() })
    .from(inAppNotifications)
    .where(
      and(
        eq(inAppNotifications.userId, userId),
        eq(inAppNotifications.isRead, false),
      ),
    );

  return Number(result?.value ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup: delete read notifications older than `daysOld` days
// Intended for a scheduled job; exposed for completeness
// ─────────────────────────────────────────────────────────────────────────────

export async function pruneReadNotifications(
  daysOld: number,
  logger: Logger,
): Promise<number> {
  const db = getDb();

  const result = await db
    .delete(inAppNotifications)
    .where(
      and(
        eq(inAppNotifications.isRead, true),
        sql`${inAppNotifications.createdAt} < NOW() - make_interval(days => ${daysOld})`,
      ),
    )
    .returning({ id: inAppNotifications.id });

  const deletedCount = result.length;
  logger.info({ deletedCount, daysOld }, "Pruned old read in-app notifications");
  return deletedCount;
}
