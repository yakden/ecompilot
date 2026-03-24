// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — content-service
// BullMQ workers: thumbnail-generation (concurrency 3) + description-generation
// (concurrency 5)
// ─────────────────────────────────────────────────────────────────────────────

import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "../db/client.js";
import { generatedContent } from "../db/schema.js";
import { generateThumbnail } from "../services/image.service.js";
import { generateDescription } from "../services/description.service.js";
import { translateListing } from "../services/description.service.js";
import {
  uploadBuffer,
  buildContentKey,
} from "../services/s3.service.js";
import {
  incrementUsage,
} from "../services/usage.service.js";
import { publishContentGenerationComplete } from "../services/nats.service.js";
import { env } from "../config/env.js";
import { createLogger } from "@ecompilot/shared-observability";
import type { Language, UserId } from "@ecompilot/shared-types";

const logger = createLogger({ service: "content-service" });

// ─────────────────────────────────────────────────────────────────────────────
// Redis connection options (shared across workers)
// ─────────────────────────────────────────────────────────────────────────────

function buildRedisOpts() {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password !== "" ? url.password : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null as unknown as undefined,
    enableReadyCheck: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue names (const enum avoids magic strings)
// ─────────────────────────────────────────────────────────────────────────────

export const QUEUE_THUMBNAIL = "thumbnail-generation" as const;
export const QUEUE_DESCRIPTION = "description-generation" as const;

// ─────────────────────────────────────────────────────────────────────────────
// Job data schemas (Zod)
// ─────────────────────────────────────────────────────────────────────────────

export const ThumbnailJobDataSchema = z.object({
  generationId: z.string().uuid(),
  userId: z.string().uuid(),
  organizationId: z.string().uuid().nullable(),
  plan: z.enum(["free", "pro", "business"]),
  /** Base64-encoded source image */
  imageBase64: z.string().min(1),
  prompt: z.string().min(1),
  language: z.enum(["ru", "pl", "ua", "en"]),
});

export const DescriptionJobDataSchema = z.object({
  generationId: z.string().uuid(),
  userId: z.string().uuid(),
  organizationId: z.string().uuid().nullable(),
  plan: z.enum(["free", "pro", "business"]),
  productName: z.string().min(1),
  category: z.string().min(1),
  features: z.array(z.string()).min(1),
  brand: z.string().optional(),
  ean: z.string().optional(),
  pricePln: z.number().positive().optional(),
  additionalContext: z.string().optional(),
  language: z.enum(["ru", "pl", "ua", "en"]),
});

export type ThumbnailJobData = z.infer<typeof ThumbnailJobDataSchema>;
export type DescriptionJobData = z.infer<typeof DescriptionJobDataSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Thumbnail generation worker
// ─────────────────────────────────────────────────────────────────────────────

export function createThumbnailWorker(): Worker<ThumbnailJobData> {
  const worker = new Worker<ThumbnailJobData>(
    QUEUE_THUMBNAIL,
    async (job: Job<ThumbnailJobData>) => {
      const data = ThumbnailJobDataSchema.parse(job.data);
      const db = getDatabase();
      const startMs = Date.now();

      logger.info(
        { generationId: data.generationId, jobId: job.id },
        "Starting thumbnail generation job",
      );

      // Mark as processing
      await db
        .update(generatedContent)
        .set({ status: "processing" })
        .where(eq(generatedContent.id, data.generationId));

      await job.updateProgress(10);

      try {
        // Decode source image
        const imageBuffer = Buffer.from(data.imageBase64, "base64");

        await job.updateProgress(20);

        // GPT-4o Vision + DALL-E 3 + Sharp
        const { buffer, analysisDescription, tokensUsed } =
          await generateThumbnail(imageBuffer, data.prompt);

        await job.updateProgress(75);

        // Upload to S3
        const fileId = crypto.randomUUID();
        const key = buildContentKey(data.userId, "thumbnail", fileId);
        const { cdnUrl } = await uploadBuffer(buffer, key, "image/webp");

        await job.updateProgress(90);

        // Persist result
        const now = new Date();
        await db
          .update(generatedContent)
          .set({
            status: "completed",
            result: { url: cdnUrl },
            tokensUsed,
            completedAt: now,
          })
          .where(eq(generatedContent.id, data.generationId));

        // Increment monthly usage counter
        await incrementUsage(data.userId, "thumbnail_generation");

        // Publish NATS event (non-fatal on failure)
        const processingTimeMs = Date.now() - startMs;
        await publishContentGenerationComplete({
          generationId: data.generationId,
          userId: data.userId as UserId,
          organizationId: data.organizationId,
          contentType: "photo",
          marketplace: "allegro",
          language: data.language as Language,
          tokenCount: tokensUsed,
          modelUsed: "dall-e-3",
          processingTimeMs,
          contentStorageKey: key,
        });

        await job.updateProgress(100);

        logger.info(
          {
            generationId: data.generationId,
            key,
            tokensUsed,
            processingTimeMs,
          },
          "Thumbnail generation completed",
        );

        return { url: cdnUrl, key, analysisDescription };
      } catch (err) {
        // Mark job as failed in DB so polling endpoints surface the error
        await db
          .update(generatedContent)
          .set({
            status: "failed",
            result: {
              errorMessage:
                err instanceof Error ? err.message : "Unknown error",
            },
            completedAt: new Date(),
          })
          .where(eq(generatedContent.id, data.generationId));

        logger.error(
          { err, generationId: data.generationId },
          "Thumbnail generation job failed",
        );

        throw err;
      }
    },
    {
      concurrency: 3,
      connection: buildRedisOpts(),
      stalledInterval: 30_000,
      maxStalledCount: 2,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, err },
      "thumbnail-generation worker: job failed",
    );
  });

  worker.on("error", (err) => {
    logger.error({ err }, "thumbnail-generation worker: connection error");
  });

  return worker;
}

// ─────────────────────────────────────────────────────────────────────────────
// Description generation worker
// ─────────────────────────────────────────────────────────────────────────────

export function createDescriptionWorker(): Worker<DescriptionJobData> {
  const worker = new Worker<DescriptionJobData>(
    QUEUE_DESCRIPTION,
    async (job: Job<DescriptionJobData>) => {
      const data = DescriptionJobDataSchema.parse(job.data);
      const db = getDatabase();

      logger.info(
        { generationId: data.generationId, jobId: job.id },
        "Starting description generation job",
      );

      await db
        .update(generatedContent)
        .set({ status: "processing" })
        .where(eq(generatedContent.id, data.generationId));

      await job.updateProgress(10);

      try {
        const { title, description, keywords, tokensUsed } =
          await generateDescription(
            {
              name: data.productName,
              category: data.category,
              features: data.features,
              ...(data.brand !== undefined && { brand: data.brand }),
              ...(data.ean !== undefined && { ean: data.ean }),
              ...(data.pricePln !== undefined && { pricePln: data.pricePln }),
              ...(data.additionalContext !== undefined && { additionalContext: data.additionalContext }),
            },
            data.language as Language,
          );

        await job.updateProgress(80);

        await db
          .update(generatedContent)
          .set({
            status: "completed",
            result: { title, description, keywords },
            tokensUsed,
            completedAt: new Date(),
          })
          .where(eq(generatedContent.id, data.generationId));

        await incrementUsage(data.userId, "description_generation");

        await job.updateProgress(100);

        logger.info(
          { generationId: data.generationId, tokensUsed },
          "Description generation completed",
        );

        return { title, description, keywords };
      } catch (err) {
        await db
          .update(generatedContent)
          .set({
            status: "failed",
            result: {
              errorMessage:
                err instanceof Error ? err.message : "Unknown error",
            },
            completedAt: new Date(),
          })
          .where(eq(generatedContent.id, data.generationId));

        logger.error(
          { err, generationId: data.generationId },
          "Description generation job failed",
        );

        throw err;
      }
    },
    {
      concurrency: 5,
      connection: buildRedisOpts(),
      stalledInterval: 30_000,
      maxStalledCount: 2,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, err },
      "description-generation worker: job failed",
    );
  });

  worker.on("error", (err) => {
    logger.error({ err }, "description-generation worker: connection error");
  });

  return worker;
}

// ─────────────────────────────────────────────────────────────────────────────
// translateListing helper — thin wrapper used directly by sync route
// (re-exported here for single import surface)
// ─────────────────────────────────────────────────────────────────────────────

export { translateListing };
