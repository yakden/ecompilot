// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — academy-service / services/video.service.ts
// S3 pre-signed URL generation for lesson video access
// TTL: 15 minutes — short-lived to prevent link sharing
// ─────────────────────────────────────────────────────────────────────────────

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Logger } from "pino";
import { env } from "../config/env.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SIGNED_URL_TTL_SECONDS = 900; // 15 minutes

// ─────────────────────────────────────────────────────────────────────────────
// S3 client singleton
// ─────────────────────────────────────────────────────────────────────────────

const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// VideoService
// ─────────────────────────────────────────────────────────────────────────────

export class VideoService {
  readonly #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  /**
   * Generate a 15-minute pre-signed S3 URL for a given S3 object key.
   * The caller is responsible for access-control checks (plan gate / preview).
   */
  async getSignedVideoUrl(s3Key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: s3Key,
    });

    try {
      const url = await getSignedUrl(s3Client, command, {
        expiresIn: SIGNED_URL_TTL_SECONDS,
      });

      this.#logger.debug(
        { s3Key, ttlSeconds: SIGNED_URL_TTL_SECONDS },
        "Generated S3 signed URL",
      );

      return url;
    } catch (err) {
      this.#logger.error({ err, s3Key }, "Failed to generate S3 signed URL");
      throw new VideoServiceError(
        `Unable to generate video URL for key: ${s3Key}`,
        s3Key,
      );
    }
  }

  /**
   * Validate that a user's plan can access a given lesson.
   * Returns true if the lesson is a free preview or the user has Pro/Business plan.
   */
  static canAccessVideo(
    userPlan: string,
    isPreview: boolean,
  ): boolean {
    if (isPreview) return true;
    return userPlan === "pro" || userPlan === "business";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed error
// ─────────────────────────────────────────────────────────────────────────────

export class VideoServiceError extends Error {
  readonly s3Key: string;

  constructor(message: string, s3Key: string) {
    super(message);
    this.name = "VideoServiceError";
    this.s3Key = s3Key;
  }
}
