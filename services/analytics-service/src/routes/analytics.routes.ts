// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — analytics-service
// Analytics REST routes
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Queue } from "bullmq";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { createLogger } from "@ecompilot/shared-observability";
import { PLAN_LIMITS, isWithinLimit, createServiceError } from "@ecompilot/shared-types";
import type { Plan } from "@ecompilot/shared-types";
import { requireAuth } from "@ecompilot/shared-auth";
import { env } from "../config/env.js";
import { getDb } from "../db/postgres.js";
import { nicheAnalyses, competitorSnapshots, usageCounters, invProducts, invSnapshots } from "../db/schema.js";
import { queryTrendingNiches } from "../db/clickhouse.js";
import type { NicheAnalysisJobData, NicheAnalysisJobResult } from "../workers/niche-analysis.worker.js";
import { getTradeData } from "../services/comtrade.service.js";
import { getEuTradeData } from "../services/eurostat.service.js";

const logger = createLogger({ service: "analytics-service" });

// ─────────────────────────────────────────────────────────────────────────────
// Request validation schemas
// ─────────────────────────────────────────────────────────────────────────────

const AnalyzeRequestSchema = z.object({
  keyword: z.string().min(1).max(150).trim(),
  googleTrendScore: z.number().min(0).max(100).default(50),
});

const JobIdParamSchema = z.object({
  jobId: z.string().min(1),
});

const KeywordParamSchema = z.object({
  keyword: z.string().min(1).max(150),
});

const AllegroUserIdParamSchema = z.object({
  allegroUserId: z.string().min(1),
});

// UN Comtrade — trade data query
const TradeDataQuerySchema = z.object({
  hs: z
    .string({ required_error: "hs (HS code) query param is required" })
    .min(2, "HS code must be at least 2 characters")
    .max(10, "HS code must be at most 10 characters")
    .regex(/^\d+$/, "HS code must contain only digits"),
  from: z
    .string({ required_error: "from (partner country code) query param is required" })
    .min(1, "partner code is required")
    .max(6, "partner code must be at most 6 characters"),
  to: z
    .string()
    .optional()
    .default("616")
    .describe("Reporter country code — defaults to 616 (Poland)"),
});

// Eurostat — EU trade data query
const EuTradeQuerySchema = z.object({
  product: z
    .string({ required_error: "product query param is required" })
    .min(1, "product code is required")
    .max(20),
  country: z
    .string({ required_error: "country query param is required" })
    .min(2, "country geo code is required")
    .max(10),
});

// ─────────────────────────────────────────────────────────────────────────────
// User extraction from verified JWT (set by shared-auth middleware)
// ─────────────────────────────────────────────────────────────────────────────

interface RequestUser {
  readonly userId: string;
  readonly plan: Plan;
}

function extractUser(request: FastifyRequest): RequestUser {
  const user = request.authUser;
  if (!user) {
    throw createHttpError(401, "AUTH_UNAUTHORIZED", "Authentication required");
  }

  const validPlans: readonly string[] = ["free", "pro", "business"];
  const resolvedPlan: Plan =
    validPlans.includes(user.plan) ? (user.plan as Plan) : "free";

  return { userId: user.sub, plan: resolvedPlan };
}

// ─────────────────────────────────────────────────────────────────────────────
// Error factory
// ─────────────────────────────────────────────────────────────────────────────

interface HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
}

function createHttpError(statusCode: number, code: string, message: string): HttpError {
  const err = new Error(message) as HttpError & { statusCode: number; code: string };
  (err as { statusCode: number }).statusCode = statusCode;
  (err as { code: string }).code = code;
  return err;
}

function isHttpError(err: unknown): err is HttpError {
  return (
    typeof err === "object" &&
    err !== null &&
    "statusCode" in err &&
    "code" in err &&
    typeof (err as Record<string, unknown>)["statusCode"] === "number"
  );
}

async function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
): Promise<void> {
  const error = createServiceError(
    code as Parameters<typeof createServiceError>[0],
    message,
  );
  await reply.status(statusCode).send({ success: false, error });
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage counting helpers
// ─────────────────────────────────────────────────────────────────────────────

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function checkAndIncrementUsage(
  userId: string,
  plan: Plan,
  feature: "nicheAnalysis",
): Promise<void> {
  const limit = PLAN_LIMITS[plan][feature];
  if (limit === -1) return; // unlimited

  const db = getDb();
  const period = currentPeriod();

  const existing = await db
    .select()
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.userId, userId),
        eq(usageCounters.feature, feature),
        eq(usageCounters.period, period),
      ),
    )
    .limit(1);

  const currentCount = existing[0]?.count ?? 0;

  if (!isWithinLimit(currentCount, limit)) {
    throw createHttpError(
      429,
      "PLAN_LIMIT_EXCEEDED",
      `You have reached your monthly limit of ${limit} niche analyses. Upgrade your plan to continue.`,
    );
  }

  // Upsert usage counter
  await db
    .insert(usageCounters)
    .values({ userId, feature, period, count: 1 })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.feature, usageCounters.period],
      set: {
        count: sql`${usageCounters.count} + 1`,
        updatedAt: new Date(),
      },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// BullMQ queue factory — created once per plugin registration
// ─────────────────────────────────────────────────────────────────────────────

function createNicheQueue(): Queue<NicheAnalysisJobData, NicheAnalysisJobResult> {
  return new Queue("niche-analysis", {
    connection: { url: env.REDIS_URL },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Seasonal calendar data (static — based on Polish e-commerce patterns)
// ─────────────────────────────────────────────────────────────────────────────

const SEASONAL_CALENDAR = [
  { month: 1, name: "Styczeń", events: ["Wyprzedaże poświąteczne"], demandIndex: 0.80 },
  { month: 2, name: "Luty", events: ["Walentynki"], demandIndex: 0.75 },
  { month: 3, name: "Marzec", events: ["Dzień Kobiet", "Wiosna"], demandIndex: 0.85 },
  { month: 4, name: "Kwiecień", events: ["Wielkanoc", "Prima Aprilis"], demandIndex: 0.90 },
  { month: 5, name: "Maj", events: ["Dzień Matki"], demandIndex: 0.95 },
  { month: 6, name: "Czerwiec", events: ["Dzień Dziecka", "Dzień Ojca"], demandIndex: 0.85 },
  { month: 7, name: "Lipiec", events: ["Lato", "Wakacje"], demandIndex: 0.80 },
  { month: 8, name: "Sierpień", events: ["Back to School"], demandIndex: 0.85 },
  { month: 9, name: "Wrzesień", events: ["Powrót do szkoły"], demandIndex: 0.95 },
  { month: 10, name: "Październik", events: ["Halloween"], demandIndex: 1.00 },
  { month: 11, name: "Listopad", events: ["Black Friday", "Cyber Monday", "Mikołajki"], demandIndex: 1.10 },
  { month: 12, name: "Grudzień", events: ["Boże Narodzenie", "Sylwester"], demandIndex: 1.20 },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Route plugin
// ─────────────────────────────────────────────────────────────────────────────

export async function analyticsRoutes(fastify: FastifyInstance): Promise<void> {
  const nicheQueue = createNicheQueue();
  const db = getDb();

  // Trending cache (in-process, refreshed every 6h)
  let trendingCache: {
    data: Awaited<ReturnType<typeof queryTrendingNiches>>;
    cachedAt: number;
  } | null = null;

  const TRENDING_TTL_MS = env.TRENDING_CACHE_TTL_SECONDS * 1000;

  // ───────────────────────────────────────────────────────────────────────────
  // POST /api/v1/analytics/niches/analyze
  // Enqueue a niche analysis job (async)
  // ───────────────────────────────────────────────────────────────────────────

  fastify.post(
    "/api/v1/analytics/niches/analyze",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = extractUser(request);

        const parseResult = AnalyzeRequestSchema.safeParse(request.body);
        if (!parseResult.success) {
          return sendError(reply, 400, "VALIDATION_ERROR", parseResult.error.message);
        }

        const { keyword, googleTrendScore } = parseResult.data;

        await checkAndIncrementUsage(user.userId, user.plan, "nicheAnalysis");

        // Create DB record first so we have the analysisId
        const [inserted] = await db
          .insert(nicheAnalyses)
          .values({
            userId: user.userId,
            keyword,
            status: "pending",
            jobId: "pending",
          })
          .returning({ id: nicheAnalyses.id });

        if (inserted === undefined) {
          return sendError(reply, 500, "INTERNAL_ERROR", "Failed to create analysis record");
        }

        const analysisId = inserted.id;

        const job = await nicheQueue.add(
          `analyze:${keyword}`,
          {
            analysisId,
            userId: user.userId,
            keyword,
            googleTrendScore,
          },
          { jobId: analysisId },
        );

        // Update record with the actual BullMQ job ID
        await db
          .update(nicheAnalyses)
          .set({ jobId: job.id ?? analysisId, updatedAt: new Date() })
          .where(eq(nicheAnalyses.id, analysisId));

        logger.info({ analysisId, jobId: job.id, keyword, userId: user.userId }, "Niche analysis enqueued");

        return reply.status(202).send({
          success: true,
          data: {
            jobId: job.id ?? analysisId,
            analysisId,
            status: "pending",
            message: "Analysis job enqueued. Poll /status/:jobId for progress.",
          },
        });
      } catch (err) {
        if (isHttpError(err)) {
          return sendError(reply, err.statusCode, err.code, err.message);
        }
        logger.error({ err }, "Unexpected error in POST /analyze");
        return sendError(reply, 500, "INTERNAL_ERROR", "Internal server error");
      }
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/analytics/niches/status/:jobId
  // Poll job status and progress
  // ───────────────────────────────────────────────────────────────────────────

  fastify.get(
    "/api/v1/analytics/niches/status/:jobId",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = extractUser(request);

        const parseResult = JobIdParamSchema.safeParse(request.params);
        if (!parseResult.success) {
          return sendError(reply, 400, "VALIDATION_ERROR", "Invalid jobId");
        }

        const { jobId } = parseResult.data;

        // Look up from DB (source of truth)
        const [record] = await db
          .select()
          .from(nicheAnalyses)
          .where(
            and(
              eq(nicheAnalyses.jobId, jobId),
              eq(nicheAnalyses.userId, user.userId),
            ),
          )
          .limit(1);

        if (record === undefined) {
          return sendError(reply, 404, "NOT_FOUND", "Job not found");
        }

        // Get live BullMQ progress
        const job = await nicheQueue.getJob(jobId);
        const progress = job !== undefined ? job.progress : 0;

        const response: Record<string, unknown> = {
          analysisId: record.id,
          jobId: record.jobId,
          keyword: record.keyword,
          status: record.status,
          progress: typeof progress === "number" ? progress : 0,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        };

        if (record.status === "completed" && record.result !== null) {
          response["result"] = record.result;
          response["score"] = record.score !== null ? Number(record.score) : null;
        }

        if (record.status === "failed") {
          response["errorMessage"] = record.errorMessage;
        }

        return reply.send({ success: true, data: response });
      } catch (err) {
        if (isHttpError(err)) {
          return sendError(reply, err.statusCode, err.code, err.message);
        }
        logger.error({ err }, "Unexpected error in GET /status/:jobId");
        return sendError(reply, 500, "INTERNAL_ERROR", "Internal server error");
      }
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/analytics/niches/:keyword
  // Latest completed analysis for a keyword
  // ───────────────────────────────────────────────────────────────────────────

  fastify.get(
    "/api/v1/analytics/niches/:keyword",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = extractUser(request);

        const parseResult = KeywordParamSchema.safeParse(request.params);
        if (!parseResult.success) {
          return sendError(reply, 400, "VALIDATION_ERROR", "Invalid keyword parameter");
        }

        const { keyword } = parseResult.data;

        const [record] = await db
          .select()
          .from(nicheAnalyses)
          .where(
            and(
              eq(nicheAnalyses.userId, user.userId),
              eq(nicheAnalyses.keyword, keyword),
              eq(nicheAnalyses.status, "completed"),
            ),
          )
          .orderBy(desc(nicheAnalyses.createdAt))
          .limit(1);

        if (record === undefined) {
          return sendError(
            reply,
            404,
            "NOT_FOUND",
            `No completed analysis found for keyword "${keyword}". Use POST /analyze to start one.`,
          );
        }

        return reply.send({
          success: true,
          data: {
            analysisId: record.id,
            keyword: record.keyword,
            score: record.score !== null ? Number(record.score) : null,
            result: record.result,
            analyzedAt: record.updatedAt,
          },
        });
      } catch (err) {
        if (isHttpError(err)) {
          return sendError(reply, err.statusCode, err.code, err.message);
        }
        logger.error({ err }, "Unexpected error in GET /niches/:keyword");
        return sendError(reply, 500, "INTERNAL_ERROR", "Internal server error");
      }
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/analytics/trending
  // Hot niches — cached every 6h
  // ───────────────────────────────────────────────────────────────────────────

  fastify.get(
    "/api/v1/analytics/trending",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        extractUser(request);

        const now = Date.now();
        if (
          trendingCache !== null &&
          now - trendingCache.cachedAt < TRENDING_TTL_MS
        ) {
          return reply.send({
            success: true,
            data: trendingCache.data,
            meta: { cachedAt: new Date(trendingCache.cachedAt).toISOString() },
          });
        }

        const trending = await queryTrendingNiches(20, 7);

        trendingCache = { data: trending, cachedAt: now };

        return reply.send({
          success: true,
          data: trending,
          meta: { cachedAt: new Date(now).toISOString() },
        });
      } catch (err) {
        if (isHttpError(err)) {
          return sendError(reply, err.statusCode, err.code, err.message);
        }
        logger.error({ err }, "Unexpected error in GET /trending");
        return sendError(reply, 500, "INTERNAL_ERROR", "Internal server error");
      }
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/analytics/competitors/:allegroUserId
  // Competitor snapshots for a given Allegro seller ID
  // ───────────────────────────────────────────────────────────────────────────

  fastify.get(
    "/api/v1/analytics/competitors/:allegroUserId",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = extractUser(request);

        // Competitors endpoint is pro/business only
        if (user.plan === "free") {
          return sendError(
            reply,
            403,
            "UPGRADE_REQUIRED",
            "Competitor analysis is available on Pro and Business plans.",
          );
        }

        const parseResult = AllegroUserIdParamSchema.safeParse(request.params);
        if (!parseResult.success) {
          return sendError(reply, 400, "VALIDATION_ERROR", "Invalid allegroUserId");
        }

        const { allegroUserId } = parseResult.data;

        const snapshots = await db
          .select()
          .from(competitorSnapshots)
          .where(eq(competitorSnapshots.sellerId, allegroUserId))
          .orderBy(desc(competitorSnapshots.snapshotDate))
          .limit(50);

        if (snapshots.length === 0) {
          return sendError(
            reply,
            404,
            "NOT_FOUND",
            `No competitor data found for seller "${allegroUserId}".`,
          );
        }

        const sellerName = snapshots[0]?.sellerName ?? allegroUserId;

        return reply.send({
          success: true,
          data: {
            allegroUserId,
            sellerName,
            snapshots: snapshots.map((s) => ({
              keyword: s.keyword,
              rating: Number(s.rating),
              listingsCount: s.listingsCount,
              avgPrice: Number(s.avgPrice),
              snapshotDate: s.snapshotDate,
            })),
          },
        });
      } catch (err) {
        if (isHttpError(err)) {
          return sendError(reply, err.statusCode, err.code, err.message);
        }
        logger.error({ err }, "Unexpected error in GET /competitors/:allegroUserId");
        return sendError(reply, 500, "INTERNAL_ERROR", "Internal server error");
      }
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/analytics/dashboard
  // Aggregated dashboard data — KPIs, revenue trend, top products, categories
  // ───────────────────────────────────────────────────────────────────────────

  fastify.get(
    "/api/v1/analytics/dashboard",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = extractUser(request);

        const [kpiRows, revenueLast30, topProducts, categoryBreakdown, recentAnalyses] =
          await Promise.all([
            // KPIs
            db
              .select({
                totalRevenue: sql<string>`COALESCE(SUM(${invProducts.totalRevenue}), 0)`,
                totalSold: sql<string>`COALESCE(SUM(${invProducts.totalSold}), 0)`,
                totalProducts: sql<string>`COUNT(*)`,
                avgMargin: sql<string>`ROUND(AVG(
                  CASE WHEN ${invProducts.sellingPrice} > 0
                  THEN ((${invProducts.sellingPrice} - ${invProducts.purchasePrice})::numeric / ${invProducts.sellingPrice}::numeric) * 100
                  ELSE 0 END
                ), 1)`,
              })
              .from(invProducts)
              .where(eq(invProducts.userId, user.userId)),

            // Revenue last 30 days from snapshots
            db
              .select({
                date: invSnapshots.date,
                revenue: sql<string>`SUM(${invSnapshots.revenue})`,
                sold: sql<string>`SUM(${invSnapshots.soldCount})`,
              })
              .from(invSnapshots)
              .innerJoin(invProducts, eq(invSnapshots.productId, invProducts.id))
              .where(
                and(
                  eq(invProducts.userId, user.userId),
                  sql`${invSnapshots.date}::date >= CURRENT_DATE - INTERVAL '30 days'`,
                ),
              )
              .groupBy(invSnapshots.date)
              .orderBy(invSnapshots.date),

            // Top 5 products by revenue
            db
              .select({
                name: invProducts.name,
                sku: invProducts.sku,
                category: invProducts.category,
                revenue: invProducts.totalRevenue,
                sold: invProducts.totalSold,
                purchasePrice: invProducts.purchasePrice,
                sellingPrice: invProducts.sellingPrice,
              })
              .from(invProducts)
              .where(eq(invProducts.userId, user.userId))
              .orderBy(desc(invProducts.totalRevenue))
              .limit(5),

            // Category breakdown
            db
              .select({
                category: invProducts.category,
                revenue: sql<string>`SUM(${invProducts.totalRevenue})`,
                products: sql<string>`COUNT(*)`,
                sold: sql<string>`SUM(${invProducts.totalSold})`,
              })
              .from(invProducts)
              .where(eq(invProducts.userId, user.userId))
              .groupBy(invProducts.category),

            // Recent completed niche analyses
            db
              .select({
                keyword: nicheAnalyses.keyword,
                score: nicheAnalyses.score,
                result: nicheAnalyses.result,
                createdAt: nicheAnalyses.createdAt,
              })
              .from(nicheAnalyses)
              .where(
                and(
                  eq(nicheAnalyses.userId, user.userId),
                  eq(nicheAnalyses.status, "completed"),
                ),
              )
              .orderBy(desc(nicheAnalyses.createdAt))
              .limit(5),
          ]);

        const kpi = kpiRows[0];

        return reply.send({
          success: true,
          data: {
            kpis: {
              totalRevenue: Number(kpi?.totalRevenue ?? 0),
              totalSold: Number(kpi?.totalSold ?? 0),
              totalProducts: Number(kpi?.totalProducts ?? 0),
              avgMargin: Number(kpi?.avgMargin ?? 0),
            },
            revenueLast30: revenueLast30.map((r) => ({
              date: r.date,
              revenue: Number(r.revenue),
              sold: Number(r.sold),
            })),
            topProducts: topProducts.map((p) => ({
              name: p.name,
              sku: p.sku,
              category: p.category,
              revenue: p.revenue ?? 0,
              sold: p.sold ?? 0,
              margin:
                p.sellingPrice > 0
                  ? Math.round(
                      ((p.sellingPrice - p.purchasePrice) / p.sellingPrice) * 1000,
                    ) / 10
                  : 0,
            })),
            categoryBreakdown: categoryBreakdown.map((c) => ({
              category: c.category,
              revenue: Number(c.revenue),
              products: Number(c.products),
              sold: Number(c.sold),
            })),
            recentAnalyses: recentAnalyses.map((a) => ({
              keyword: a.keyword,
              score: a.score !== null ? Number(a.score) : null,
              recommendation:
                (a.result as Record<string, unknown> | null)?.recommendation ?? null,
              analyzedAt: a.createdAt.toISOString(),
            })),
          },
        });
      } catch (err) {
        if (isHttpError(err)) {
          return sendError(reply, err.statusCode, err.code, err.message);
        }
        logger.error({ err }, "Unexpected error in GET /dashboard");
        return sendError(reply, 500, "INTERNAL_ERROR", "Internal server error");
      }
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/analytics/seasonal
  // Static seasonal e-commerce calendar for Poland
  // ───────────────────────────────────────────────────────────────────────────

  fastify.get(
    "/api/v1/analytics/seasonal",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        extractUser(request);

        const currentMonth = new Date().getUTCMonth() + 1;

        return reply.send({
          success: true,
          data: {
            currentMonth,
            calendar: SEASONAL_CALENDAR,
            insight: `Current month demand index: ${
              SEASONAL_CALENDAR.find((m) => m.month === currentMonth)?.demandIndex ?? 1.0
            }`,
          },
        });
      } catch (err) {
        if (isHttpError(err)) {
          return sendError(reply, err.statusCode, err.code, err.message);
        }
        logger.error({ err }, "Unexpected error in GET /seasonal");
        return sendError(reply, 500, "INTERNAL_ERROR", "Internal server error");
      }
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/analytics/trade-data
  // UN Comtrade — Polish import statistics for a given HS code and partner
  // ───────────────────────────────────────────────────────────────────────────

  fastify.get(
    "/api/v1/analytics/trade-data",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        extractUser(request);

        const parseResult = TradeDataQuerySchema.safeParse(request.query);
        if (!parseResult.success) {
          return sendError(reply, 400, "VALIDATION_ERROR", parseResult.error.message);
        }

        const { hs, from } = parseResult.data;

        const result = await getTradeData(
          hs,
          from,
          env.REDIS_URL,
          env.COMTRADE_KEY,
        );

        return reply.send({ success: true, data: result });
      } catch (err) {
        if (isHttpError(err)) {
          return sendError(reply, err.statusCode, err.code, err.message);
        }
        logger.error({ err }, "Unexpected error in GET /trade-data");
        return sendError(reply, 500, "INTERNAL_ERROR", "Internal server error");
      }
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/analytics/eu-trade
  // Eurostat — EU trade statistics for Poland
  // ───────────────────────────────────────────────────────────────────────────

  fastify.get(
    "/api/v1/analytics/eu-trade",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        extractUser(request);

        const parseResult = EuTradeQuerySchema.safeParse(request.query);
        if (!parseResult.success) {
          return sendError(reply, 400, "VALIDATION_ERROR", parseResult.error.message);
        }

        const { product, country } = parseResult.data;

        const result = await getEuTradeData(product, country, env.REDIS_URL);

        return reply.send({ success: true, data: result });
      } catch (err) {
        if (isHttpError(err)) {
          return sendError(reply, err.statusCode, err.code, err.message);
        }
        logger.error({ err }, "Unexpected error in GET /eu-trade");
        return sendError(reply, 500, "INTERNAL_ERROR", "Internal server error");
      }
    },
  );

  // Graceful shutdown of the queue
  fastify.addHook("onClose", async () => {
    await nicheQueue.close();
    logger.info("BullMQ niche-analysis queue closed");
  });
}
