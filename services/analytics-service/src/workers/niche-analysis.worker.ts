// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — analytics-service
// BullMQ worker: niche-analysis queue
// Concurrency: 5, Progress: 10→50→90→100
// Saves to PostgreSQL + ClickHouse, publishes to NATS
// ─────────────────────────────────────────────────────────────────────────────

import { Worker, type Job } from "bullmq";
import { connect, type NatsConnection, StringCodec } from "nats";
import { eq } from "drizzle-orm";
import { createLogger } from "@ecompilot/shared-observability";
import { env } from "../config/env.js";
import { scrapeAllegro } from "../scrapers/allegro.scraper.js";
import { computeNicheAnalysis, computeTop3SellerShare } from "../services/scoring.service.js";
import { getDb } from "../db/postgres.js";
import { nicheAnalyses, competitorSnapshots } from "../db/schema.js";
import { insertNicheSnapshots } from "../db/clickhouse.js";
import type { NicheSnapshotRow } from "../db/clickhouse.js";
import type { NicheAnalysisResult } from "../services/scoring.service.js";

const logger = createLogger({ service: "analytics-service" });

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface NicheAnalysisJobData {
  readonly analysisId: string;
  readonly userId: string;
  readonly keyword: string;
  readonly googleTrendScore: number;
}

export interface NicheAnalysisJobResult {
  readonly analysisId: string;
  readonly score: number;
  readonly listingsCount: number;
  readonly completedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// NATS publisher
// ─────────────────────────────────────────────────────────────────────────────

let _nats: NatsConnection | null = null;
const sc = StringCodec();

async function getNats(): Promise<NatsConnection> {
  if (_nats === null || _nats.isClosed()) {
    _nats = await connect({ servers: env.NATS_URL });
    logger.info({ natsUrl: env.NATS_URL }, "NATS connected (worker)");
  }
  return _nats;
}

async function publishNicheComplete(
  result: NicheAnalysisResult,
  analysisId: string,
  userId: string,
  processingTimeMs: number,
): Promise<void> {
  try {
    const nc = await getNats();
    const payload = {
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      correlationId: crypto.randomUUID(),
      source: "analytics-service",
      schemaVersion: 1,
      type: "analytics.niche_analysis.complete",
      payload: {
        analysisId,
        userId,
        organizationId: null,
        query: result.keyword,
        marketplace: "allegro",
        resultCount: result.listings.length,
        processingTimeMs,
        completedAt: result.analyzedAt,
        resultStorageKey: null,
      },
    };

    nc.publish(
      "analytics.niche.analysis.complete",
      sc.encode(JSON.stringify(payload)),
    );

    logger.info({ analysisId, subject: "analytics.niche.analysis.complete" }, "NATS event published");
  } catch (err) {
    logger.error({ err, analysisId }, "Failed to publish NATS event");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PostgreSQL helpers
// ─────────────────────────────────────────────────────────────────────────────

async function markProcessing(analysisId: string): Promise<void> {
  const db = getDb();
  await db
    .update(nicheAnalyses)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(nicheAnalyses.id, analysisId));
}

async function saveResult(
  analysisId: string,
  result: NicheAnalysisResult,
): Promise<void> {
  const db = getDb();
  await db
    .update(nicheAnalyses)
    .set({
      status: "completed",
      score: String(result.score),
      result,
      updatedAt: new Date(),
    })
    .where(eq(nicheAnalyses.id, analysisId));
}

async function markFailed(analysisId: string, errorMessage: string): Promise<void> {
  const db = getDb();
  await db
    .update(nicheAnalyses)
    .set({ status: "failed", errorMessage, updatedAt: new Date() })
    .where(eq(nicheAnalyses.id, analysisId));
}

async function saveCompetitorSnapshots(
  keyword: string,
  result: NicheAnalysisResult,
): Promise<void> {
  const db = getDb();
  const snapshotDate = new Date().toISOString().slice(0, 10);

  const rows = result.topSellers.map((seller) => ({
    keyword,
    sellerId: seller.sellerName.toLowerCase().replace(/\s+/g, "_"),
    sellerName: seller.sellerName,
    rating: String(seller.avgRating),
    listingsCount: seller.listingsCount,
    avgPrice: String(result.priceAnalysis.avg),
    snapshotDate,
  }));

  if (rows.length > 0) {
    await db.insert(competitorSnapshots).values(rows);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ClickHouse snapshot builder
// ─────────────────────────────────────────────────────────────────────────────

function buildClickHouseSnapshot(
  result: NicheAnalysisResult,
  googleTrendScore: number,
): NicheSnapshotRow {
  const uniqueSellers = new Set(result.listings.map((l) => l.sellerName)).size;
  const top3Share = computeTop3SellerShare(result.listings);

  return {
    snapshot_date: new Date().toISOString().slice(0, 10),
    keyword: result.keyword,
    category_id: 0,
    listings_count: result.listings.length,
    avg_price: result.priceAnalysis.avg,
    min_price: result.priceAnalysis.min,
    max_price: result.priceAnalysis.max,
    median_price: result.priceAnalysis.median,
    unique_sellers: uniqueSellers,
    top3_seller_share: top3Share,
    google_trend_score: googleTrendScore,
    niche_score: result.score,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Job processor
// ─────────────────────────────────────────────────────────────────────────────

async function processNicheAnalysis(
  job: Job<NicheAnalysisJobData, NicheAnalysisJobResult>,
): Promise<NicheAnalysisJobResult> {
  const { analysisId, userId, keyword, googleTrendScore } = job.data;
  const startedAt = Date.now();

  logger.info({ jobId: job.id, analysisId, keyword }, "Starting niche analysis job");

  // 10% — job accepted, marking as processing
  await job.updateProgress(10);
  await markProcessing(analysisId);

  // 50% — scraping complete
  const scraperResult = await scrapeAllegro(keyword);
  await job.updateProgress(50);

  if (scraperResult.listings.length === 0) {
    logger.warn(
      { jobId: job.id, keyword },
      "Scraping returned no listings — Playwright may not be installed or keyword has no results",
    );
  } else {
    logger.info(
      { jobId: job.id, keyword, listingsFound: scraperResult.listings.length },
      "Scraping complete",
    );
  }

  // 90% — scoring complete
  const result = computeNicheAnalysis({
    keyword,
    listings: scraperResult.listings,
    googleTrendScore,
  });
  await job.updateProgress(90);

  // Save to PostgreSQL
  await saveResult(analysisId, result);
  await saveCompetitorSnapshots(keyword, result);

  // Save to ClickHouse
  const chSnapshot = buildClickHouseSnapshot(result, googleTrendScore);
  await insertNicheSnapshots([chSnapshot]);

  const processingTimeMs = Date.now() - startedAt;

  // Publish NATS event
  await publishNicheComplete(result, analysisId, userId, processingTimeMs);

  // 100% — done
  await job.updateProgress(100);

  logger.info(
    { jobId: job.id, analysisId, keyword, score: result.score, processingTimeMs },
    "Niche analysis job completed",
  );

  return {
    analysisId,
    score: result.score,
    listingsCount: result.listings.length,
    completedAt: result.analyzedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker factory
// ─────────────────────────────────────────────────────────────────────────────

export function createNicheAnalysisWorker(): Worker<
  NicheAnalysisJobData,
  NicheAnalysisJobResult
> {
  const worker = new Worker<NicheAnalysisJobData, NicheAnalysisJobResult>(
    "niche-analysis",
    async (job) => {
      try {
        return await processNicheAnalysis(job);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        logger.error({ err, jobId: job.id, analysisId: job.data.analysisId }, "Job failed");
        await markFailed(job.data.analysisId, message).catch(() => undefined);
        throw err;
      }
    },
    {
      concurrency: 5,
      connection: {
        url: env.REDIS_URL,
      },
    },
  );

  worker.on("completed", (job, result) => {
    logger.info(
      { jobId: job.id, analysisId: result.analysisId, score: result.score },
      "Worker job completed",
    );
  });

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, err },
      "Worker job failed",
    );
  });

  worker.on("stalled", (jobId) => {
    logger.warn({ jobId }, "Worker job stalled");
  });

  logger.info({ concurrency: 5, queue: "niche-analysis" }, "Niche analysis worker started");

  return worker;
}

// ─────────────────────────────────────────────────────────────────────────────
// NATS shutdown helper (called from graceful shutdown)
// ─────────────────────────────────────────────────────────────────────────────

export async function closeWorkerNats(): Promise<void> {
  if (_nats !== null && !_nats.isClosed()) {
    await _nats.close();
    _nats = null;
    logger.info("NATS connection closed (worker)");
  }
}
