// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — academy-service / services/certificate.service.ts
// Certificate issuance (requires 100% course completion) and public verification
// ─────────────────────────────────────────────────────────────────────────────

import { randomBytes } from "crypto";
import { eq, and, count } from "drizzle-orm";
import type { Logger } from "pino";
import { db } from "../db/client.js";
import { courses, lessons, userProgress, certificates } from "../db/schema.js";
import type { Certificate } from "../db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum watched percentage to consider a lesson complete */
const COMPLETION_THRESHOLD_PCT = 80;

/** Verification code byte length — produces 32 hex chars */
const VERIFICATION_CODE_BYTES = 16;

// ─────────────────────────────────────────────────────────────────────────────
// Result types — discriminated unions for exhaustive handling
// ─────────────────────────────────────────────────────────────────────────────

export type GenerateCertificateResult =
  | { readonly success: true; readonly certificate: Certificate }
  | { readonly success: false; readonly reason: CertificateFailureReason };

export type CertificateFailureReason =
  | "course_not_found"
  | "already_issued"
  | "incomplete_course"
  | "internal_error";

export interface CertificateVerification {
  readonly certificate: Certificate;
  readonly course: {
    readonly titleRu: string;
    readonly titlePl: string;
    readonly titleUa: string;
    readonly titleEn: string;
    readonly slug: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CertificateService
// ─────────────────────────────────────────────────────────────────────────────

export class CertificateService {
  readonly #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  /**
   * Issue a certificate for a user who has completed all lessons in a course.
   * A lesson is considered complete when watchedPct >= COMPLETION_THRESHOLD_PCT.
   * Returns an existing certificate if one was already issued.
   */
  async generateCertificate(
    userId: string,
    courseId: string,
  ): Promise<GenerateCertificateResult> {
    try {
      // ── Verify course exists ─────────────────────────────────────────────

      const [course] = await db
        .select({
          id: courses.id,
          lessonCount: courses.lessonCount,
          titleRu: courses.titleRu,
          titlePl: courses.titlePl,
          titleUa: courses.titleUa,
          titleEn: courses.titleEn,
          slug: courses.slug,
        })
        .from(courses)
        .where(eq(courses.id, courseId))
        .limit(1);

      if (!course) {
        return { success: false, reason: "course_not_found" };
      }

      // ── Check for existing certificate ──────────────────────────────────

      const [existing] = await db
        .select()
        .from(certificates)
        .where(
          and(
            eq(certificates.userId, userId),
            eq(certificates.courseId, courseId),
          ),
        )
        .limit(1);

      if (existing) {
        this.#logger.info(
          { userId, courseId, certificateId: existing.id },
          "Certificate already exists — returning existing",
        );
        return { success: true, certificate: existing };
      }

      // ── Count total lessons in course ────────────────────────────────────

      const [lessonCountRow] = await db
        .select({ total: count() })
        .from(lessons)
        .where(eq(lessons.courseId, courseId));

      const totalLessons = lessonCountRow?.total ?? 0;

      if (totalLessons === 0) {
        this.#logger.warn({ userId, courseId }, "Course has no lessons");
        return { success: false, reason: "course_not_found" };
      }

      // ── Count completed lessons for this user ────────────────────────────

      const [completedCountRow] = await db
        .select({ completed: count() })
        .from(userProgress)
        .where(
          and(
            eq(userProgress.userId, userId),
            eq(userProgress.courseId, courseId),
          ),
        );

      // A progress row is only created/updated when watchedPct >= threshold
      const completedLessons = completedCountRow?.completed ?? 0;

      if (completedLessons < totalLessons) {
        this.#logger.info(
          { userId, courseId, completedLessons, totalLessons },
          "Course not fully completed — cannot issue certificate",
        );
        return { success: false, reason: "incomplete_course" };
      }

      // ── Issue certificate ─────────────────────────────────────────────────

      const verificationCode = randomBytes(VERIFICATION_CODE_BYTES)
        .toString("hex"); // 32 hex chars

      const [cert] = await db
        .insert(certificates)
        .values({
          userId,
          courseId,
          verificationCode,
          certificateUrl: this.#buildCertificateUrl(verificationCode, course.slug),
        })
        .returning();

      if (!cert) {
        throw new Error("Certificate insert returned no rows");
      }

      this.#logger.info(
        { userId, courseId, certificateId: cert.id, verificationCode },
        "Certificate issued successfully",
      );

      return { success: true, certificate: cert };
    } catch (err) {
      this.#logger.error(
        { err, userId, courseId },
        "Unexpected error generating certificate",
      );
      return { success: false, reason: "internal_error" };
    }
  }

  /**
   * Public endpoint — verify a certificate by its 32-char code.
   * Returns course details so the certificate page can be rendered.
   */
  async verifyCertificate(
    code: string,
  ): Promise<CertificateVerification | null> {
    const [cert] = await db
      .select()
      .from(certificates)
      .where(eq(certificates.verificationCode, code))
      .limit(1);

    if (!cert) {
      return null;
    }

    const [course] = await db
      .select({
        titleRu: courses.titleRu,
        titlePl: courses.titlePl,
        titleUa: courses.titleUa,
        titleEn: courses.titleEn,
        slug: courses.slug,
      })
      .from(courses)
      .where(eq(courses.id, cert.courseId))
      .limit(1);

    if (!course) {
      return null;
    }

    return { certificate: cert, course };
  }

  /**
   * Calculate completion percentage for a user in a course (0–100).
   */
  async getCourseCompletionPct(
    userId: string,
    courseId: string,
  ): Promise<number> {
    const [lessonCountRow] = await db
      .select({ total: count() })
      .from(lessons)
      .where(eq(lessons.courseId, courseId));

    const total = lessonCountRow?.total ?? 0;
    if (total === 0) return 0;

    const [progressRow] = await db
      .select({ completed: count() })
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, userId),
          eq(userProgress.courseId, courseId),
        ),
      );

    const completed = progressRow?.completed ?? 0;
    return Math.round((completed / total) * 100);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  #buildCertificateUrl(verificationCode: string, courseSlug: string): string {
    return `https://academy.ecompilot.pl/certificates/${courseSlug}/${verificationCode}`;
  }
}

// Re-export threshold so routes can use it for explanatory messages
export { COMPLETION_THRESHOLD_PCT };
