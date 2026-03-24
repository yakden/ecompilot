// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — content-service
// Content generation routes: thumbnails, descriptions, background removal,
// translations
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { Queue } from "bullmq";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "../db/client.js";
import { generatedContent } from "../db/schema.js";
import { removeBackground, resizeForAllegro } from "../services/image.service.js";
import {
  generateDescription,
  translateListing,
} from "../services/description.service.js";
import {
  uploadBuffer,
  buildContentKey,
} from "../services/s3.service.js";
import {
  checkPlanLimit,
  incrementUsage,
} from "../services/usage.service.js";
import { env } from "../config/env.js";
import {
  QUEUE_THUMBNAIL,
  QUEUE_DESCRIPTION,
  type ThumbnailJobData,
  type DescriptionJobData,
} from "../workers/content.worker.js";
import {
  createServiceError,
  createSuccessResponse,
} from "@ecompilot/shared-types";
import type { Plan, Language } from "@ecompilot/shared-types";
import { PlanLimitExceededError } from "../services/usage.service.js";
import { createLogger } from "@ecompilot/shared-observability";
import { requireAuth } from "@ecompilot/shared-auth";
import { lookupProductByEan } from "../services/icecat.service.js";
import { lookupFoodProduct } from "../services/openfoodfacts.service.js";
import { lookupProductByBarcode } from "../services/upcitemdb.service.js";
import { getRedisClient } from "../services/redis.client.js";

const logger = createLogger({ service: "content-service" });

// ─────────────────────────────────────────────────────────────────────────────
// Redis queue helpers (lazy-initialised)
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

let _thumbnailQueue: Queue<ThumbnailJobData> | null = null;
let _descriptionQueue: Queue<DescriptionJobData> | null = null;

function getThumbnailQueue(): Queue<ThumbnailJobData> {
  if (_thumbnailQueue !== null) return _thumbnailQueue;
  _thumbnailQueue = new Queue<ThumbnailJobData>(QUEUE_THUMBNAIL, {
    connection: buildRedisOpts(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });
  return _thumbnailQueue;
}

function getDescriptionQueue(): Queue<DescriptionJobData> {
  if (_descriptionQueue !== null) return _descriptionQueue;
  _descriptionQueue = new Queue<DescriptionJobData>(QUEUE_DESCRIPTION, {
    connection: buildRedisOpts(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });
  return _descriptionQueue;
}

// ─────────────────────────────────────────────────────────────────────────────
// Request header extraction helpers
// ─────────────────────────────────────────────────────────────────────────────

// In a real deployment the API gateway injects these headers after JWT
// validation; we read them here for plan-limit enforcement.

function extractUserId(request: FastifyRequest): string {
  const user = request.authUser;
  if (!user) {
    throw new Error("Authentication required");
  }
  return user.sub;
}

function extractPlan(request: FastifyRequest): Plan {
  const user = request.authUser;
  const plan = user?.plan;
  if (plan === "pro" || plan === "business" || plan === "free") return plan;
  return "free";
}

function extractLanguage(request: FastifyRequest): Language {
  const lang = request.authUser?.language;
  if (lang === "pl" || lang === "en" || lang === "ru" || lang === "ua")
    return lang;
  return "pl";
}

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas for request bodies
// ─────────────────────────────────────────────────────────────────────────────

const EnrichProductBodySchema = z.object({
  ean: z
    .string()
    .min(8)
    .max(14)
    .regex(/^\d+$/, "EAN must contain only digits"),
  language: z.string().length(2).optional(),
});

/**
 * EAN-13 pattern: exactly 13 numeric digits.
 * Used to decide whether Icecat lookup is worth attempting.
 */
const EAN13_RE = /^\d{13}$/;

const GenerateDescriptionBodySchema = z.object({
  productName: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  features: z.array(z.string().min(1)).min(1).max(20),
  brand: z.string().max(100).optional(),
  ean: z.string().max(20).optional(),
  pricePln: z.number().positive().optional(),
  additionalContext: z.string().max(500).optional(),
  language: z.enum(["ru", "pl", "ua", "en"]).optional(),
});

const TranslateListingBodySchema = z.object({
  title: z.string().min(1).max(75),
  description: z.string().min(1).max(3000),
  fromLang: z.enum(["ru", "pl", "ua", "en"]),
  toLang: z.enum(["ru", "pl", "ua", "en"]),
});

// ─────────────────────────────────────────────────────────────────────────────
// Error handler helper
// ─────────────────────────────────────────────────────────────────────────────

function handleRouteError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof PlanLimitExceededError) {
    return reply.status(402).send({
      success: false,
      error: createServiceError(
        "PLAN_LIMIT_EXCEEDED",
        err.message,
        { feature: err.feature, plan: err.plan, current: err.current, limit: err.limit },
      ),
    });
  }

  if (err instanceof z.ZodError) {
    return reply.status(400).send({
      success: false,
      error: createServiceError(
        "VALIDATION_ERROR",
        "Invalid request body",
        { issues: err.issues },
      ),
    });
  }

  logger.error({ err }, "Unhandled route error");
  return reply.status(500).send({
    success: false,
    error: createServiceError("INTERNAL_ERROR", "An unexpected error occurred"),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

export async function contentRoutes(app: FastifyInstance): Promise<void> {
  // ───────────────────────────────────────────────────────────────────────────
  // POST /api/v1/content/generate-thumbnail
  // Accepts multipart form data: image file + JSON prompt field
  // Returns 202 { jobId } — asynchronous via BullMQ
  // ───────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/v1/content/generate-thumbnail",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = extractUserId(request);
        const plan = extractPlan(request);
        const language = extractLanguage(request);

        await checkPlanLimit(userId, "thumbnail_generation", plan);

        // Parse multipart — cast to multipart-augmented request type
        const multipartRequest = request as FastifyRequest & { file(): Promise<MultipartFile | undefined> };
        const data = await multipartRequest.file();
        if (data === undefined) {
          return reply.status(400).send({
            success: false,
            error: createServiceError(
              "VALIDATION_ERROR",
              "No file provided in multipart form",
            ),
          });
        }

        // Read prompt from form field
        const promptField = (data.fields as Record<string, { value?: string } | undefined>)["prompt"];
        const prompt =
          typeof promptField?.value === "string" && promptField.value.trim() !== ""
            ? promptField.value.trim()
            : "Professional product photo on white background";

        const imageBuffer = await data.toBuffer();

        if (imageBuffer.length === 0) {
          return reply.status(400).send({
            success: false,
            error: createServiceError(
              "VALIDATION_ERROR",
              "Uploaded file is empty",
            ),
          });
        }

        if (imageBuffer.length > 10 * 1024 * 1024) {
          return reply.status(400).send({
            success: false,
            error: createServiceError(
              "VALIDATION_ERROR",
              "Image exceeds 10 MB limit",
            ),
          });
        }

        // Create DB record
        const generationId = crypto.randomUUID();
        const db = getDatabase();

        await db.insert(generatedContent).values({
          id: generationId,
          userId,
          type: "thumbnail",
          status: "pending",
          input: {
            type: "thumbnail",
            prompt,
            originalImageKey: "",
          },
        });

        // Enqueue BullMQ job
        const jobData: ThumbnailJobData = {
          generationId,
          userId,
          organizationId: null,
          plan,
          imageBase64: imageBuffer.toString("base64"),
          prompt,
          language,
        };

        const job = await getThumbnailQueue().add(`thumb-${generationId}`, jobData);
        const jobId = job.id ?? generationId;

        // Store BullMQ job ID for polling
        await db
          .update(generatedContent)
          .set({ jobId })
          .where(eq(generatedContent.id, generationId));

        logger.info(
          { generationId, jobId, userId },
          "Thumbnail generation job enqueued",
        );

        return reply.status(202).send(
          createSuccessResponse({ jobId, generationId }),
        );
      } catch (err) {
        return handleRouteError(reply, err);
      }
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/content/status/:jobId
  // Returns { status, progress, resultUrl? }
  // ───────────────────────────────────────────────────────────────────────────
  app.get(
    "/api/v1/content/status/:jobId",
    async (
      request: FastifyRequest<{ Params: { jobId: string } }>,
      reply: FastifyReply,
    ) => {
      const { jobId } = request.params;
      const userId = extractUserId(request);

      const db = getDatabase();
      const rows = await db
        .select()
        .from(generatedContent)
        .where(eq(generatedContent.jobId, jobId))
        .limit(1);

      const record = rows[0];
      if (record === undefined) {
        return reply.status(404).send({
          success: false,
          error: createServiceError("NOT_FOUND", `Job '${jobId}' not found`),
        });
      }

      // Authorise: only the owner may poll
      if (record.userId !== userId) {
        return reply.status(403).send({
          success: false,
          error: createServiceError(
            "AUTH_FORBIDDEN",
            "Access denied to this job",
          ),
        });
      }

      // Try to get live BullMQ progress for in-flight jobs
      let progress: number | undefined;
      if (record.status === "pending" || record.status === "processing") {
        try {
          const queueName =
            record.type === "thumbnail"
              ? QUEUE_THUMBNAIL
              : QUEUE_DESCRIPTION;

          const queue = queueName === QUEUE_THUMBNAIL
            ? getThumbnailQueue()
            : getDescriptionQueue();

          const bullJob = await queue.getJob(jobId);
          if (bullJob !== undefined && bullJob !== null) {
            const p = bullJob.progress;
            progress = typeof p === "number" ? p : undefined;
          }
        } catch {
          // Non-critical — progress is optional
        }
      }

      return reply.send(
        createSuccessResponse({
          jobId,
          generationId: record.id,
          status: record.status,
          progress: progress ?? (record.status === "completed" ? 100 : undefined),
          resultUrl: record.result?.url,
          result: record.result,
          createdAt: record.createdAt,
          completedAt: record.completedAt,
        }),
      );
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // POST /api/v1/content/remove-background
  // Synchronous (<2 s). Returns { url } — CDN URL of processed image.
  // ───────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/v1/content/remove-background",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = extractUserId(request);
        const plan = extractPlan(request);

        await checkPlanLimit(userId, "background_removal", plan);

        const multipartRequest = request as FastifyRequest & { file(): Promise<MultipartFile | undefined> };
        const data = await multipartRequest.file();
        if (data === undefined) {
          return reply.status(400).send({
            success: false,
            error: createServiceError(
              "VALIDATION_ERROR",
              "No file provided in multipart form",
            ),
          });
        }

        const imageBuffer = await data.toBuffer();

        if (imageBuffer.length === 0) {
          return reply.status(400).send({
            success: false,
            error: createServiceError(
              "VALIDATION_ERROR",
              "Uploaded file is empty",
            ),
          });
        }

        if (imageBuffer.length > 10 * 1024 * 1024) {
          return reply.status(400).send({
            success: false,
            error: createServiceError(
              "VALIDATION_ERROR",
              "Image exceeds 10 MB limit",
            ),
          });
        }

        // Remove background (rembg or fallback)
        const processedBuffer = await removeBackground(imageBuffer);

        // Resize to Allegro spec
        const { buffer: finalBuffer } = await resizeForAllegro(processedBuffer);

        // Upload to S3
        const fileId = crypto.randomUUID();
        const key = buildContentKey(userId, "background_removal", fileId);
        const { cdnUrl } = await uploadBuffer(finalBuffer, key, "image/webp");

        // Persist record
        const generationId = crypto.randomUUID();
        const db = getDatabase();
        await db.insert(generatedContent).values({
          id: generationId,
          userId,
          type: "background_removal",
          status: "completed",
          input: { type: "background_removal", originalImageKey: key },
          result: { url: cdnUrl },
          completedAt: new Date(),
        });

        await incrementUsage(userId, "background_removal");

        return reply.send(createSuccessResponse({ url: cdnUrl, key }));
      } catch (err) {
        return handleRouteError(reply, err);
      }
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // POST /api/v1/content/generate-description
  // Synchronous GPT-4o text generation.
  // Returns { title, description, keywords }
  // ───────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/v1/content/generate-description",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = extractUserId(request);
        const plan = extractPlan(request);
        const userLanguage = extractLanguage(request);

        await checkPlanLimit(userId, "description_generation", plan);

        const body = GenerateDescriptionBodySchema.parse(request.body);
        const language = (body.language ?? userLanguage) as Language;

        const generationId = crypto.randomUUID();
        const db = getDatabase();

        await db.insert(generatedContent).values({
          id: generationId,
          userId,
          type: "description",
          status: "processing",
          input: {
            type: "description",
            productName: body.productName,
            category: body.category,
            features: body.features,
            language,
          },
        });

        const { title, description, keywords, tokensUsed } =
          await generateDescription(
            {
              name: body.productName,
              category: body.category,
              features: body.features,
              ...(body.brand !== undefined && { brand: body.brand }),
              ...(body.ean !== undefined && { ean: body.ean }),
              ...(body.pricePln !== undefined && { pricePln: body.pricePln }),
              ...(body.additionalContext !== undefined && { additionalContext: body.additionalContext }),
            },
            language,
          );

        await db
          .update(generatedContent)
          .set({
            status: "completed",
            result: { title, description, keywords },
            tokensUsed,
            completedAt: new Date(),
          })
          .where(eq(generatedContent.id, generationId));

        await incrementUsage(userId, "description_generation");

        return reply.send(
          createSuccessResponse({ title, description, keywords }),
        );
      } catch (err) {
        return handleRouteError(reply, err);
      }
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // POST /api/v1/content/translate-listing
  // Synchronous GPT-4o translation.
  // Returns { translatedTitle, translatedDescription }
  // ───────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/v1/content/translate-listing",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = extractUserId(request);
        const plan = extractPlan(request);

        await checkPlanLimit(userId, "translation", plan);

        const body = TranslateListingBodySchema.parse(request.body);

        if (body.fromLang === body.toLang) {
          return reply.status(400).send({
            success: false,
            error: createServiceError(
              "VALIDATION_ERROR",
              "fromLang and toLang must be different",
            ),
          });
        }

        const generationId = crypto.randomUUID();
        const db = getDatabase();

        await db.insert(generatedContent).values({
          id: generationId,
          userId,
          type: "translation",
          status: "processing",
          input: {
            type: "translation",
            title: body.title,
            description: body.description,
            fromLang: body.fromLang,
            toLang: body.toLang,
          },
        });

        const { translatedTitle, translatedDescription, tokensUsed } =
          await translateListing(
            { title: body.title, description: body.description },
            body.fromLang as Language,
            body.toLang as Language,
          );

        await db
          .update(generatedContent)
          .set({
            status: "completed",
            result: { translatedTitle, translatedDescription },
            tokensUsed,
            completedAt: new Date(),
          })
          .where(eq(generatedContent.id, generationId));

        await incrementUsage(userId, "translation");

        return reply.send(
          createSuccessResponse({ translatedTitle, translatedDescription }),
        );
      } catch (err) {
        return handleRouteError(reply, err);
      }
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // POST /api/v1/content/enrich-product  (Icecat)
  // Body: { ean: string, language?: string }
  // Returns Icecat product datasheet for the given EAN/GTIN.
  // ───────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/v1/content/enrich-product",
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = EnrichProductBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: createServiceError(
            "VALIDATION_ERROR",
            "Invalid request body",
            { issues: parseResult.error.issues },
          ),
        });
      }

      const { ean, language = "pl" } = parseResult.data;

      const result = await lookupProductByEan(ean, language);

      if (!result.found) {
        return reply.send(
          createSuccessResponse({
            found: false as const,
            error: result.error,
          }),
        );
      }

      const p = result.product;
      return reply.send(
        createSuccessResponse({
          found: true as const,
          product: {
            title: p.title,
            description: p.description,
            brand: p.brand,
            category: p.category,
            specs: p.specs,
            images: p.images,
            source: p.source,
          },
        }),
      );
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/content/food-product/:barcode  (Open Food Facts)
  // Returns nutritional and ingredient data for a food product barcode.
  // ───────────────────────────────────────────────────────────────────────────
  app.get(
    "/api/v1/content/food-product/:barcode",
    async (
      request: FastifyRequest<{ Params: { barcode: string } }>,
      reply: FastifyReply,
    ) => {
      const { barcode } = request.params;

      if (!/^\d{6,14}$/.test(barcode)) {
        return reply.status(400).send({
          success: false,
          error: createServiceError(
            "VALIDATION_ERROR",
            "Barcode must be 6–14 numeric digits",
          ),
        });
      }

      const result = await lookupFoodProduct(barcode);

      if (!result.found) {
        return reply.send(
          createSuccessResponse({
            found: false as const,
            error: result.error,
          }),
        );
      }

      const p = result.product;
      return reply.send(
        createSuccessResponse({
          found: true as const,
          product: {
            name: p.name,
            brand: p.brand,
            categories: p.categories,
            ingredients: p.ingredients,
            nutriScore: p.nutriScore,
            allergens: p.allergens,
            image: p.image,
            nutriments: {
              energy: p.nutriments.energyKcal,
              fat: p.nutriments.fat,
              carbs: p.nutriments.carbs,
              protein: p.nutriments.protein,
              salt: p.nutriments.salt,
            },
          },
        }),
      );
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/content/barcode/:code  (UPCitemdb)
  // Returns product identity data from UPCitemdb (690 M+ barcodes).
  // ───────────────────────────────────────────────────────────────────────────
  app.get(
    "/api/v1/content/barcode/:code",
    async (
      request: FastifyRequest<{ Params: { code: string } }>,
      reply: FastifyReply,
    ) => {
      const { code } = request.params;

      if (!/^\d{6,14}$/.test(code)) {
        return reply.status(400).send({
          success: false,
          error: createServiceError(
            "VALIDATION_ERROR",
            "Barcode must be 6–14 numeric digits",
          ),
        });
      }

      const result = await lookupProductByBarcode(code);

      if (!result.found) {
        return reply.send(
          createSuccessResponse({
            found: false as const,
            error: result.error,
          }),
        );
      }

      const p = result.product;
      return reply.send(
        createSuccessResponse({
          found: true as const,
          product: {
            title: p.title,
            brand: p.brand,
            category: p.category,
            images: p.images,
            source: p.source,
          },
        }),
      );
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/content/lookup/:barcode  (combined)
  // Waterfall: Redis cache → UPCitemdb → Icecat (EAN-13) → Open Food Facts
  // Returns the best available product data with source attribution.
  // ───────────────────────────────────────────────────────────────────────────
  app.get(
    "/api/v1/content/lookup/:barcode",
    async (
      request: FastifyRequest<{ Params: { barcode: string } }>,
      reply: FastifyReply,
    ) => {
      const { barcode } = request.params;

      if (!/^\d{6,14}$/.test(barcode)) {
        return reply.status(400).send({
          success: false,
          error: createServiceError(
            "VALIDATION_ERROR",
            "Barcode must be 6–14 numeric digits",
          ),
        });
      }

      // ── 1. Unified lookup cache (avoids re-running the waterfall) ──────────
      const combinedCacheKey = `lookup:combined:${barcode}`;
      try {
        const redis = getRedisClient();
        const cached = await redis.get(combinedCacheKey);
        if (cached !== null) {
          return reply.send(createSuccessResponse(JSON.parse(cached) as unknown));
        }
      } catch {
        // Non-fatal — proceed without cache
      }

      // ── 2. UPCitemdb — broadest coverage, fastest ──────────────────────────
      const upcResult = await lookupProductByBarcode(barcode);

      if (upcResult.found) {
        const p = upcResult.product;
        const payload = {
          found: true as const,
          product: {
            title: p.title,
            brand: p.brand,
            category: p.category,
            images: [...p.images],
            source: p.source,
          },
        };
        // Cache the combined result for 30 days (matches UPCitemdb TTL)
        try {
          const redis = getRedisClient();
          await redis.setex(combinedCacheKey, 30 * 24 * 3_600, JSON.stringify(payload));
        } catch { /* Non-fatal */ }
        return reply.send(createSuccessResponse(payload));
      }

      // ── 3. Icecat — try if barcode is EAN-13 ──────────────────────────────
      if (EAN13_RE.test(barcode)) {
        const icecatResult = await lookupProductByEan(barcode, "pl");

        if (icecatResult.found) {
          const p = icecatResult.product;
          const payload = {
            found: true as const,
            product: {
              title: p.title,
              brand: p.brand,
              category: p.category,
              description: p.description,
              specs: p.specs,
              images: [...p.images],
              source: p.source,
            },
          };
          try {
            const redis = getRedisClient();
            await redis.setex(combinedCacheKey, 24 * 3_600, JSON.stringify(payload));
          } catch { /* Non-fatal */ }
          return reply.send(createSuccessResponse(payload));
        }
      }

      // ── 4. Open Food Facts — UPC failed, always try food catalog ────────────
      // At this point upcResult.found is false; the food catalog is a good
      // final fallback for both food items and general products.
      {
        const offResult = await lookupFoodProduct(barcode);

        if (offResult.found) {
          const p = offResult.product;
          const payload = {
            found: true as const,
            product: {
              title: p.name,
              brand: p.brand,
              category: p.categories,
              description: p.ingredients,
              nutriScore: p.nutriScore,
              allergens: p.allergens,
              images: p.image !== null ? [p.image] : [],
              nutriments: {
                energy: p.nutriments.energyKcal,
                fat: p.nutriments.fat,
                carbs: p.nutriments.carbs,
                protein: p.nutriments.protein,
                salt: p.nutriments.salt,
              },
              source: p.source,
            },
          };
          try {
            const redis = getRedisClient();
            await redis.setex(combinedCacheKey, 7 * 24 * 3_600, JSON.stringify(payload));
          } catch { /* Non-fatal */ }
          return reply.send(createSuccessResponse(payload));
        }
      }

      // ── 5. Scraper fallback — headless browser (slowest, last resort) ────────
      // Calls scraper-service which uses Playwright to search Google and Allegro.
      // 15-second timeout to avoid blocking the response indefinitely.
      try {
        const scraperRes = await fetch("http://localhost:3018/api/v1/scraper/search-product", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: barcode }),
          signal: AbortSignal.timeout(15_000),
        });

        if (scraperRes.ok) {
          const scraperJson = await scraperRes.json() as Record<string, unknown>;
          // Support both { found, product } and { data: { found, product } } shapes
          const scraperData =
            (scraperJson["data"] as Record<string, unknown> | undefined) ?? scraperJson;

          const found = scraperData["found"];
          if (found === true) {
            const product = scraperData["product"] as Record<string, unknown> | undefined;
            if (product !== undefined) {
              const scraperPayload = {
                found: true as const,
                product: {
                  title: String(product["title"] ?? ""),
                  description: typeof product["description"] === "string"
                    ? product["description"]
                    : undefined,
                  price: typeof product["price"] === "number" ? product["price"] : undefined,
                  currency: typeof product["currency"] === "string"
                    ? product["currency"]
                    : undefined,
                  images: Array.isArray(product["images"])
                    ? (product["images"] as unknown[]).filter((v): v is string => typeof v === "string")
                    : [],
                  specs: Array.isArray(product["specs"])
                    ? (product["specs"] as unknown[]).filter(
                        (v): v is { name: string; value: string } =>
                          typeof v === "object" && v !== null &&
                          "name" in v && "value" in v,
                      )
                    : [],
                  category: typeof product["category"] === "string"
                    ? product["category"]
                    : undefined,
                  source: (product["source"] === "allegro" || product["source"] === "google")
                    ? product["source"]
                    : ("scraper" as const),
                  url: typeof product["url"] === "string" ? product["url"] : undefined,
                },
              };

              // Cache scraper result for 7 days
              try {
                const redis = getRedisClient();
                await redis.setex(
                  combinedCacheKey,
                  7 * 24 * 3_600,
                  JSON.stringify(scraperPayload),
                );
              } catch { /* Non-fatal */ }

              logger.info({ barcode, source: scraperPayload.product.source }, "Product found via scraper fallback");
              return reply.send(createSuccessResponse(scraperPayload));
            }
          }
        }
      } catch {
        // scraper-service unavailable or timed out — skip silently
        logger.debug({ barcode }, "Scraper fallback unavailable or timed out");
      }

      // ── 6. All sources exhausted ───────────────────────────────────────────
      logger.info({ barcode }, "Product not found in any data source");
      return reply.send(
        createSuccessResponse({
          found: false as const,
          error: "Product not found in any data source (UPCitemdb, Icecat, Open Food Facts, Scraper)",
        }),
      );
    },
  );
}
