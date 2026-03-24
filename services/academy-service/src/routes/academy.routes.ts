// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — academy-service / routes/academy.routes.ts
// Academy LMS REST API: courses, lessons, video URLs, progress, certificates
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { eq, and, asc, inArray, type SQL } from "drizzle-orm";
import type { Logger } from "pino";
import type { Language } from "@ecompilot/shared-types";
import { isLanguage } from "@ecompilot/shared-types";
import { db } from "../db/client.js";
import {
  courses,
  lessons,
  userProgress,
  certificates,
} from "../db/schema.js";
import type { CourseCategory, CourseLevel } from "../db/schema.js";
import { VideoService } from "../services/video.service.js";
import { CertificateService, COMPLETION_THRESHOLD_PCT } from "../services/certificate.service.js";
import {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
} from "../middleware/auth.middleware.js";

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────────

const CoursesQuerySchema = z.object({
  lang: z.enum(["ru", "pl", "ua", "en"]).optional(),
  category: z
    .enum(["allegro", "import", "legal", "dropship", "ads", "amazon"])
    .optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
});

const CourseSlugParamsSchema = z.object({
  slug: z.string().min(1),
});

const LessonVideoParamsSchema = z.object({
  id: z.string().uuid(),
});

const ProgressBodySchema = z.object({
  lessonId: z.string().uuid(),
  watchedPct: z.number().int().min(0).max(100),
});

const CertificateCodeParamsSchema = z.object({
  code: z.string().length(32),
});

// ─────────────────────────────────────────────────────────────────────────────
// Title/description field picker by language
// ─────────────────────────────────────────────────────────────────────────────

function pickTitle(
  row: {
    titleRu: string;
    titlePl: string;
    titleUa: string;
    titleEn: string;
  },
  lang: Language,
): string {
  switch (lang) {
    case "ru": return row.titleRu;
    case "pl": return row.titlePl;
    case "ua": return row.titleUa;
    case "en": return row.titleEn;
  }
}

function pickDescription(
  row: {
    descriptionRu: string;
    descriptionPl: string;
    descriptionUa: string;
    descriptionEn: string;
  },
  lang: Language,
): string {
  switch (lang) {
    case "ru": return row.descriptionRu;
    case "pl": return row.descriptionPl;
    case "ua": return row.descriptionUa;
    case "en": return row.descriptionEn;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────────────────────────────────────────

export async function registerAcademyRoutes(
  app: FastifyInstance,
  options: {
    videoService: VideoService;
    certificateService: CertificateService;
    logger: Logger;
  },
): Promise<void> {
  const { videoService, certificateService, logger } = options;

  const authenticate = createAuthMiddleware(logger);
  const optionalAuth = createOptionalAuthMiddleware();

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/v1/academy/courses
  // Public list with optional lang/category/level filters.
  // If authenticated, annotates each course with user's completion %.
  // ─────────────────────────────────────────────────────────────────────────

  app.get(
    "/api/v1/academy/courses",
    { preHandler: [optionalAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = CoursesQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query parameters",
            details: query.error.flatten(),
            timestamp: new Date().toISOString(),
          },
        });
      }

      const { lang, category, level } = query.data;
      const resolvedLang: Language =
        lang !== undefined && isLanguage(lang) ? lang : "ru";

      // Build filter conditions dynamically
      const conditions: SQL[] = [];
      conditions.push(eq(courses.isPublished, true));
      if (category !== undefined) {
        conditions.push(eq(courses.category, category));
      }
      if (level !== undefined) {
        conditions.push(eq(courses.level, level));
      }

      const rows = await db
        .select({
          id: courses.id,
          slug: courses.slug,
          titleRu: courses.titleRu,
          titlePl: courses.titlePl,
          titleUa: courses.titleUa,
          titleEn: courses.titleEn,
          descriptionRu: courses.descriptionRu,
          descriptionPl: courses.descriptionPl,
          descriptionUa: courses.descriptionUa,
          descriptionEn: courses.descriptionEn,
          level: courses.level,
          category: courses.category,
          thumbnailUrl: courses.thumbnailUrl,
          totalDurationMin: courses.totalDurationMin,
          lessonCount: courses.lessonCount,
          isFree: courses.isFree,
          priceEur: courses.priceEur,
          requiredPlan: courses.requiredPlan,
          sortOrder: courses.sortOrder,
        })
        .from(courses)
        .where(and(...conditions))
        .orderBy(asc(courses.sortOrder));

      // If authenticated, fetch progress for all courses
      const userId = request.userOptional?.sub;
      let progressMap: Map<string, number> = new Map();

      if (userId !== undefined) {
        const courseIds = rows.map((r) => r.id);
        if (courseIds.length > 0) {
          const progressData = await Promise.all(
            courseIds.map((cid) =>
              certificateService.getCourseCompletionPct(userId, cid),
            ),
          );
          courseIds.forEach((cid, idx) => {
            progressMap.set(cid, progressData[idx] ?? 0);
          });
        }
      }

      const items = rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: pickTitle(row, resolvedLang),
        description: pickDescription(row, resolvedLang),
        level: row.level as CourseLevel,
        category: row.category as CourseCategory,
        thumbnailUrl: row.thumbnailUrl,
        totalDurationMin: row.totalDurationMin,
        lessonCount: row.lessonCount,
        isFree: row.isFree,
        priceEur: row.priceEur,
        requiredPlan: row.requiredPlan,
        sortOrder: row.sortOrder,
        ...(userId !== undefined
          ? { completionPct: progressMap.get(row.id) ?? 0 }
          : {}),
      }));

      return reply.send({ success: true, data: { items, total: items.length } });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/v1/academy/courses/:slug
  // Course detail with full lesson list (no video URLs — those require plan check)
  // ─────────────────────────────────────────────────────────────────────────

  app.get(
    "/api/v1/academy/courses/:slug",
    { preHandler: [optionalAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = CourseSlugParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid course slug",
            timestamp: new Date().toISOString(),
          },
        });
      }

      const queryLang = (request.query as Record<string, unknown>)["lang"];
      const resolvedLang: Language =
        typeof queryLang === "string" && isLanguage(queryLang)
          ? queryLang
          : "ru";

      const [course] = await db
        .select()
        .from(courses)
        .where(
          and(
            eq(courses.slug, params.data.slug),
            eq(courses.isPublished, true),
          ),
        )
        .limit(1);

      if (!course) {
        return reply.code(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Course not found",
            timestamp: new Date().toISOString(),
          },
        });
      }

      const courseLessons = await db
        .select({
          id: lessons.id,
          titleRu: lessons.titleRu,
          titlePl: lessons.titlePl,
          titleUa: lessons.titleUa,
          titleEn: lessons.titleEn,
          durationMin: lessons.durationMin,
          sortOrder: lessons.sortOrder,
          isPreview: lessons.isPreview,
          resourcesJson: lessons.resourcesJson,
        })
        .from(lessons)
        .where(eq(lessons.courseId, course.id))
        .orderBy(asc(lessons.sortOrder));

      // Progress map for this course
      const userId = request.userOptional?.sub;
      let lessonProgressMap: Map<string, number> = new Map();

      if (userId !== undefined && courseLessons.length > 0) {
        const lessonIds = courseLessons.map((l) => l.id);
        const progressRows = await db
          .select({
            lessonId: userProgress.lessonId,
            watchedPct: userProgress.watchedPct,
          })
          .from(userProgress)
          .where(
            and(
              eq(userProgress.userId, userId),
              eq(userProgress.courseId, course.id),
              inArray(userProgress.lessonId, lessonIds),
            ),
          );

        for (const p of progressRows) {
          lessonProgressMap.set(p.lessonId, p.watchedPct);
        }
      }

      const lessonItems = courseLessons.map((l) => ({
        id: l.id,
        title: pickTitle(l, resolvedLang),
        durationMin: l.durationMin,
        sortOrder: l.sortOrder,
        isPreview: l.isPreview,
        resources: l.resourcesJson ?? [],
        ...(userId !== undefined
          ? { watchedPct: lessonProgressMap.get(l.id) ?? 0 }
          : {}),
      }));

      const completionPct =
        userId !== undefined
          ? await certificateService.getCourseCompletionPct(userId, course.id)
          : undefined;

      return reply.send({
        success: true,
        data: {
          id: course.id,
          slug: course.slug,
          title: pickTitle(course, resolvedLang),
          description: pickDescription(course, resolvedLang),
          level: course.level,
          category: course.category,
          thumbnailUrl: course.thumbnailUrl,
          totalDurationMin: course.totalDurationMin,
          lessonCount: course.lessonCount,
          isFree: course.isFree,
          priceEur: course.priceEur,
          requiredPlan: course.requiredPlan,
          lessons: lessonItems,
          ...(completionPct !== undefined ? { completionPct } : {}),
        },
      });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/v1/academy/lessons/:id/video
  // Returns a 15-min pre-signed S3 URL.
  // Access rules: Pro/Business plan OR lesson is a free preview.
  // ─────────────────────────────────────────────────────────────────────────

  app.get(
    "/api/v1/academy/lessons/:id/video",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = LessonVideoParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid lesson ID",
            timestamp: new Date().toISOString(),
          },
        });
      }

      const [lesson] = await db
        .select({
          id: lessons.id,
          videoUrl: lessons.videoUrl,
          isPreview: lessons.isPreview,
          courseId: lessons.courseId,
        })
        .from(lessons)
        .where(eq(lessons.id, params.data.id))
        .limit(1);

      if (!lesson) {
        return reply.code(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Lesson not found",
            timestamp: new Date().toISOString(),
          },
        });
      }

      const { plan } = request.user;

      if (!VideoService.canAccessVideo(plan, lesson.isPreview)) {
        logger.info(
          { userId: request.user.sub, lessonId: lesson.id, plan },
          "Video access denied — plan upgrade required",
        );
        return reply.code(403).send({
          success: false,
          error: {
            code: "UPGRADE_REQUIRED",
            message:
              "This lesson requires a Pro or Business plan. Free users can only access preview lessons.",
            details: { currentPlan: plan, requiredPlan: "pro" },
            timestamp: new Date().toISOString(),
          },
        });
      }

      try {
        const signedUrl = await videoService.getSignedVideoUrl(lesson.videoUrl);
        return reply.send({
          success: true,
          data: {
            url: signedUrl,
            lessonId: lesson.id,
            expiresInSeconds: 900,
          },
        });
      } catch (err) {
        logger.error(
          { err, lessonId: lesson.id, s3Key: lesson.videoUrl },
          "Failed to generate video URL",
        );
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Unable to generate video URL",
            timestamp: new Date().toISOString(),
          },
        });
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/v1/academy/progress
  // Save or update lesson progress for the authenticated user.
  // Marks completedAt when watchedPct >= COMPLETION_THRESHOLD_PCT.
  // ─────────────────────────────────────────────────────────────────────────

  app.post(
    "/api/v1/academy/progress",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = ProgressBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: body.error.flatten(),
            timestamp: new Date().toISOString(),
          },
        });
      }

      const { lessonId, watchedPct } = body.data;
      const userId = request.user.sub;

      // Resolve courseId from the lesson
      const [lesson] = await db
        .select({ courseId: lessons.courseId })
        .from(lessons)
        .where(eq(lessons.id, lessonId))
        .limit(1);

      if (!lesson) {
        return reply.code(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Lesson not found",
            timestamp: new Date().toISOString(),
          },
        });
      }

      const isCompleted = watchedPct >= COMPLETION_THRESHOLD_PCT;
      const completedAt = isCompleted ? new Date() : null;

      // Upsert — update if exists (unique on userId + lessonId)
      const [existing] = await db
        .select({ id: userProgress.id, watchedPct: userProgress.watchedPct })
        .from(userProgress)
        .where(
          and(
            eq(userProgress.userId, userId),
            eq(userProgress.lessonId, lessonId),
          ),
        )
        .limit(1);

      if (existing) {
        // Only update if the new value is higher (never regress progress)
        const newPct = Math.max(existing.watchedPct, watchedPct);
        const newCompleted =
          newPct >= COMPLETION_THRESHOLD_PCT ? (existing.watchedPct < COMPLETION_THRESHOLD_PCT ? new Date() : undefined) : undefined;

        await db
          .update(userProgress)
          .set({
            watchedPct: newPct,
            ...(newCompleted !== undefined
              ? { completedAt: newCompleted }
              : {}),
          })
          .where(eq(userProgress.id, existing.id));

        return reply.send({
          success: true,
          data: {
            lessonId,
            watchedPct: newPct,
            completed: newPct >= COMPLETION_THRESHOLD_PCT,
          },
        });
      }

      // Insert new progress row
      await db.insert(userProgress).values({
        userId,
        courseId: lesson.courseId,
        lessonId,
        watchedPct,
        ...(completedAt !== null ? { completedAt } : {}),
      });

      logger.info(
        { userId, lessonId, watchedPct, completed: isCompleted },
        "Progress saved",
      );

      return reply.code(201).send({
        success: true,
        data: { lessonId, watchedPct, completed: isCompleted },
      });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/v1/academy/my-courses
  // Courses the authenticated user has started, with completion percentages
  // ─────────────────────────────────────────────────────────────────────────

  app.get(
    "/api/v1/academy/my-courses",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user.sub;
      const queryLang = (request.query as Record<string, unknown>)["lang"];
      const resolvedLang: Language =
        typeof queryLang === "string" && isLanguage(queryLang)
          ? queryLang
          : "ru";

      // Find all courseIds the user has progress in
      const progressRows = await db
        .selectDistinct({ courseId: userProgress.courseId })
        .from(userProgress)
        .where(eq(userProgress.userId, userId));

      if (progressRows.length === 0) {
        return reply.send({ success: true, data: { items: [] } });
      }

      const courseIds = progressRows.map((r) => r.courseId);

      const courseRows = await db
        .select({
          id: courses.id,
          slug: courses.slug,
          titleRu: courses.titleRu,
          titlePl: courses.titlePl,
          titleUa: courses.titleUa,
          titleEn: courses.titleEn,
          thumbnailUrl: courses.thumbnailUrl,
          totalDurationMin: courses.totalDurationMin,
          lessonCount: courses.lessonCount,
          level: courses.level,
          category: courses.category,
        })
        .from(courses)
        .where(inArray(courses.id, courseIds))
        .orderBy(asc(courses.sortOrder));

      const completionPcts = await Promise.all(
        courseRows.map((c) =>
          certificateService.getCourseCompletionPct(userId, c.id),
        ),
      );

      const items = courseRows.map((row, idx) => ({
        id: row.id,
        slug: row.slug,
        title: pickTitle(row, resolvedLang),
        thumbnailUrl: row.thumbnailUrl,
        totalDurationMin: row.totalDurationMin,
        lessonCount: row.lessonCount,
        level: row.level,
        category: row.category,
        completionPct: completionPcts[idx] ?? 0,
      }));

      return reply.send({ success: true, data: { items } });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/v1/academy/certificates
  // List of certificates earned by the authenticated user
  // ─────────────────────────────────────────────────────────────────────────

  app.get(
    "/api/v1/academy/certificates",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user.sub;
      const queryLang = (request.query as Record<string, unknown>)["lang"];
      const resolvedLang: Language =
        typeof queryLang === "string" && isLanguage(queryLang)
          ? queryLang
          : "ru";

      const rows = await db
        .select({
          id: certificates.id,
          courseId: certificates.courseId,
          issuedAt: certificates.issuedAt,
          certificateUrl: certificates.certificateUrl,
          verificationCode: certificates.verificationCode,
          titleRu: courses.titleRu,
          titlePl: courses.titlePl,
          titleUa: courses.titleUa,
          titleEn: courses.titleEn,
          slug: courses.slug,
        })
        .from(certificates)
        .innerJoin(courses, eq(courses.id, certificates.courseId))
        .where(eq(certificates.userId, userId))
        .orderBy(asc(certificates.issuedAt));

      const items = rows.map((row) => ({
        id: row.id,
        courseId: row.courseId,
        courseSlug: row.slug,
        courseTitle: pickTitle(
          {
            titleRu: row.titleRu,
            titlePl: row.titlePl,
            titleUa: row.titleUa,
            titleEn: row.titleEn,
          },
          resolvedLang,
        ),
        issuedAt: row.issuedAt,
        certificateUrl: row.certificateUrl,
        verificationCode: row.verificationCode,
      }));

      return reply.send({ success: true, data: { items } });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/v1/academy/certificates/generate
  // Trigger certificate generation for a completed course
  // ─────────────────────────────────────────────────────────────────────────

  app.post(
    "/api/v1/academy/certificates/generate",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = z
        .object({ courseId: z.string().uuid() })
        .safeParse(request.body);

      if (!body.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "courseId (UUID) is required",
            timestamp: new Date().toISOString(),
          },
        });
      }

      const userId = request.user.sub;
      const result = await certificateService.generateCertificate(
        userId,
        body.data.courseId,
      );

      if (!result.success) {
        const statusMap: Record<
          typeof result.reason,
          { status: number; code: string; message: string }
        > = {
          course_not_found: {
            status: 404,
            code: "NOT_FOUND",
            message: "Course not found",
          },
          already_issued: {
            status: 409,
            code: "ALREADY_EXISTS",
            message: "Certificate already issued for this course",
          },
          incomplete_course: {
            status: 422,
            code: "VALIDATION_ERROR",
            message: `Course not completed. Watch at least ${COMPLETION_THRESHOLD_PCT}% of each lesson to earn a certificate.`,
          },
          internal_error: {
            status: 500,
            code: "INTERNAL_ERROR",
            message: "Certificate generation failed",
          },
        };

        const mapped = statusMap[result.reason];
        return reply.code(mapped.status).send({
          success: false,
          error: {
            code: mapped.code,
            message: mapped.message,
            timestamp: new Date().toISOString(),
          },
        });
      }

      return reply.code(201).send({
        success: true,
        data: result.certificate,
      });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/v1/academy/certificates/:code/verify
  // PUBLIC — verify a certificate by its 32-char verification code
  // ─────────────────────────────────────────────────────────────────────────

  app.get(
    "/api/v1/academy/certificates/:code/verify",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = CertificateCodeParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Verification code must be exactly 32 characters",
            timestamp: new Date().toISOString(),
          },
        });
      }

      const result = await certificateService.verifyCertificate(
        params.data.code,
      );

      if (!result) {
        return reply.code(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Certificate not found or verification code is invalid",
            timestamp: new Date().toISOString(),
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          certificateId: result.certificate.id,
          userId: result.certificate.userId,
          issuedAt: result.certificate.issuedAt,
          certificateUrl: result.certificate.certificateUrl,
          verificationCode: result.certificate.verificationCode,
          course: result.course,
        },
      });
    },
  );
}
