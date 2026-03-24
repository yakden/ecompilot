// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — academy-service / db/schema.ts
// Drizzle ORM table definitions for LMS: courses, lessons, progress, certs
// ─────────────────────────────────────────────────────────────────────────────

import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  pgEnum,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const courseLevelEnum = pgEnum("course_level", [
  "beginner",
  "intermediate",
  "advanced",
]);

export const courseCategoryEnum = pgEnum("course_category", [
  "allegro",
  "import",
  "legal",
  "dropship",
  "ads",
  "amazon",
]);

// ─────────────────────────────────────────────────────────────────────────────
// courses
// ─────────────────────────────────────────────────────────────────────────────

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),

  // Multilingual titles
  titleRu: text("title_ru").notNull(),
  titlePl: text("title_pl").notNull(),
  titleUa: text("title_ua").notNull(),
  titleEn: text("title_en").notNull(),

  // Multilingual descriptions
  descriptionRu: text("description_ru").notNull(),
  descriptionPl: text("description_pl").notNull(),
  descriptionUa: text("description_ua").notNull(),
  descriptionEn: text("description_en").notNull(),

  level: courseLevelEnum("level").notNull(),
  category: courseCategoryEnum("category").notNull(),

  thumbnailUrl: text("thumbnail_url"),
  totalDurationMin: integer("total_duration_min").notNull().default(0),
  lessonCount: integer("lesson_count").notNull().default(0),

  isPublished: boolean("is_published").notNull().default(true),
  isFree: boolean("is_free").notNull().default(false),
  priceEur: numeric("price_eur", { precision: 10, scale: 2 }),

  // Plan required to access this course ("free" | "pro" | "business")
  requiredPlan: text("required_plan").notNull().default("pro"),

  sortOrder: integer("sort_order").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const coursesRelations = relations(courses, ({ many }) => ({
  lessons: many(lessons),
  userProgress: many(userProgress),
  certificates: many(certificates),
}));

// ─────────────────────────────────────────────────────────────────────────────
// lessons
// ─────────────────────────────────────────────────────────────────────────────

export const lessons = pgTable("lessons", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),

  // Multilingual titles
  titleRu: text("title_ru").notNull(),
  titlePl: text("title_pl").notNull(),
  titleUa: text("title_ua").notNull(),
  titleEn: text("title_en").notNull(),

  // S3 object key (e.g. "videos/course-slug/lesson-01.mp4")
  videoUrl: text("video_url").notNull(),

  durationMin: integer("duration_min").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),

  // Free preview — accessible without Pro plan
  isPreview: boolean("is_preview").notNull().default(false),

  // Optional transcripts
  transcriptRu: text("transcript_ru"),
  transcriptPl: text("transcript_pl"),

  // Additional resources: [{title: string, url: string, type: string}]
  resourcesJson: jsonb("resources_json").$type<
    ReadonlyArray<{ readonly title: string; readonly url: string; readonly type: string }>
  >(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  course: one(courses, {
    fields: [lessons.courseId],
    references: [courses.id],
  }),
  userProgress: many(userProgress),
}));

// ─────────────────────────────────────────────────────────────────────────────
// user_progress
// ─────────────────────────────────────────────────────────────────────────────

export const userProgress = pgTable(
  "user_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),

    // Percentage of lesson watched (0–100)
    watchedPct: integer("watched_pct").notNull().default(0),

    // Set when watchedPct >= 80 (lesson considered complete)
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    uniqueUserLesson: uniqueIndex("user_progress_user_lesson_idx").on(
      table.userId,
      table.lessonId,
    ),
  }),
);

export const userProgressRelations = relations(userProgress, ({ one }) => ({
  course: one(courses, {
    fields: [userProgress.courseId],
    references: [courses.id],
  }),
  lesson: one(lessons, {
    fields: [userProgress.lessonId],
    references: [lessons.id],
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// certificates
// ─────────────────────────────────────────────────────────────────────────────

export const certificates = pgTable("certificates", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),

  issuedAt: timestamp("issued_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  // Public URL to the rendered certificate PDF / image
  certificateUrl: text("certificate_url"),

  // 32-char hex random string for public verification endpoint
  verificationCode: text("verification_code").notNull().unique(),
});

export const certificatesRelations = relations(certificates, ({ one }) => ({
  course: one(courses, {
    fields: [certificates.courseId],
    references: [courses.id],
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Inferred types
// ─────────────────────────────────────────────────────────────────────────────

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;
export type UserProgress = typeof userProgress.$inferSelect;
export type NewUserProgress = typeof userProgress.$inferInsert;
export type Certificate = typeof certificates.$inferSelect;
export type NewCertificate = typeof certificates.$inferInsert;

export type CourseLevel = (typeof courseLevelEnum.enumValues)[number];
export type CourseCategory = (typeof courseCategoryEnum.enumValues)[number];
