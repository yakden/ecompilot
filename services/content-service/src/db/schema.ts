// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — content-service
// Drizzle ORM schema: generated_content + usage_counters
// ─────────────────────────────────────────────────────────────────────────────

import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  unique,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const contentTypeEnum = pgEnum("content_type", [
  "thumbnail",
  "description",
  "background_removal",
  "translation",
]);

export const contentStatusEnum = pgEnum("content_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

// ─────────────────────────────────────────────────────────────────────────────
// TypeScript types for JSONB columns
// ─────────────────────────────────────────────────────────────────────────────

export type ContentType = (typeof contentTypeEnum.enumValues)[number];
export type ContentStatus = (typeof contentStatusEnum.enumValues)[number];

/** Input payload stored with the job — union over all possible content types */
export type ContentInput =
  | { type: "thumbnail"; prompt: string; originalImageKey: string }
  | {
      type: "description";
      productName: string;
      category: string;
      features: string[];
      language: string;
    }
  | { type: "background_removal"; originalImageKey: string }
  | {
      type: "translation";
      title: string;
      description: string;
      fromLang: string;
      toLang: string;
    };

/** Result payload — fields are optional depending on content type */
export interface ContentResult {
  readonly url?: string;
  readonly title?: string;
  readonly description?: string;
  readonly keywords?: string[];
  readonly translatedTitle?: string;
  readonly translatedDescription?: string;
  readonly errorMessage?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// generated_content
// ─────────────────────────────────────────────────────────────────────────────

export const generatedContent = pgTable(
  "generated_content",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    userId: uuid("user_id").notNull(),

    type: contentTypeEnum("type").notNull(),

    status: contentStatusEnum("status").notNull().default("pending"),

    /** Raw input parameters for the generation job */
    input: jsonb("input").$type<ContentInput>().notNull(),

    /** Completed result payload: URL, text fields, keywords, etc. */
    result: jsonb("result").$type<ContentResult>(),

    /** BullMQ job ID — used for polling progress */
    jobId: text("job_id"),

    /** Number of OpenAI tokens consumed during generation */
    tokensUsed: integer("tokens_used"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    userIdIdx: index("idx_generated_content_user_id").on(table.userId),
    jobIdIdx: index("idx_generated_content_job_id").on(table.jobId),
    statusIdx: index("idx_generated_content_status").on(table.status),
    typeIdx: index("idx_generated_content_type").on(table.type),
    createdAtIdx: index("idx_generated_content_created_at").on(table.createdAt),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// usage_counters
// Monthly per-user, per-feature counters for plan limit enforcement
// ─────────────────────────────────────────────────────────────────────────────

export const usageCounters = pgTable(
  "usage_counters",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    userId: uuid("user_id").notNull(),

    /** Feature key, e.g. "thumbnail_generation", "background_removal" */
    feature: text("feature").notNull(),

    /** Calendar period: YYYY-MM, e.g. "2026-03" */
    period: text("period").notNull(),

    count: integer("count").notNull().default(0),
  },
  (table) => ({
    userFeaturePeriodUq: unique("uq_usage_counters_user_feature_period").on(
      table.userId,
      table.feature,
      table.period,
    ),
    userIdIdx: index("idx_usage_counters_user_id").on(table.userId),
    periodIdx: index("idx_usage_counters_period").on(table.period),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Inferred row types
// ─────────────────────────────────────────────────────────────────────────────

export type GeneratedContentRow = typeof generatedContent.$inferSelect;
export type NewGeneratedContent = typeof generatedContent.$inferInsert;

export type UsageCounterRow = typeof usageCounters.$inferSelect;
export type NewUsageCounter = typeof usageCounters.$inferInsert;
