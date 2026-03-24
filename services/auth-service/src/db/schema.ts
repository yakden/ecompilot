// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — auth-service: Drizzle ORM PostgreSQL schema
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
import { relations } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// users
// ─────────────────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash"),
    language: text("language").notNull().default("ru"),
    plan: text("plan").notNull().default("free"),
    emailVerified: boolean("email_verified").notNull().default(false),
    emailVerificationToken: text("email_verification_token"),
    passwordResetToken: text("password_reset_token"),
    passwordResetExpires: timestamp("password_reset_expires", { withTimezone: true }),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    mfaSecret: text("mfa_secret"),
    mfaBackupCodes: jsonb("mfa_backup_codes").$type<string[]>(),
    googleId: text("google_id").unique(),
    appleId: text("apple_id").unique(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: index("users_email_idx").on(table.email),
    googleIdIdx: index("users_google_id_idx").on(table.googleId),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// refresh_tokens
// ─────────────────────────────────────────────────────────────────────────────

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revoked: boolean("revoked").notNull().default(false),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Token family for Refresh Token Rotation — detect reuse attacks */
    family: text("family").notNull(),
    deviceInfo: jsonb("device_info").$type<{
      userAgent?: string;
      ipAddress?: string;
      platform?: string;
    }>(),
  },
  (table) => ({
    userIdIdx: index("refresh_tokens_user_id_idx").on(table.userId),
    tokenHashIdx: uniqueIndex("refresh_tokens_token_hash_idx").on(table.tokenHash),
  }),
);

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// audit_log
// ─────────────────────────────────────────────────────────────────────────────

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    success: boolean("success").notNull(),
    failureReason: text("failure_reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("audit_log_user_id_idx").on(table.userId),
    actionIdx: index("audit_log_action_idx").on(table.action),
  }),
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// user_api_keys
// ─────────────────────────────────────────────────────────────────────────────

export const userApiKeys = pgTable(
  "user_api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    service: text("service").notNull(), // 'allegro' | 'google_search' | 'openai' | 'stripe' | 'serpapi'
    encryptedData: text("encrypted_data").notNull(), // AES-256-GCM encrypted JSON blob
    metadata: jsonb("metadata").$type<{
      connectedEmail?: string;
      expiresAt?: string;
      scopes?: string[];
      displayName?: string;
    }>(),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userServiceIdx: uniqueIndex("user_api_keys_user_service_idx").on(
      table.userId,
      table.service,
    ),
  }),
);

export type UserApiKey = typeof userApiKeys.$inferSelect;
export type NewUserApiKey = typeof userApiKeys.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  auditLogs: many(auditLog),
  apiKeys: many(userApiKeys),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(users, {
    fields: [auditLog.userId],
    references: [users.id],
  }),
}));

export const userApiKeysRelations = relations(userApiKeys, ({ one }) => ({
  user: one(users, {
    fields: [userApiKeys.userId],
    references: [users.id],
  }),
}));
