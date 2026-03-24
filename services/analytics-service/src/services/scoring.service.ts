// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — analytics-service
// NicheScore algorithm (0-100) with multi-dimensional analysis
// ─────────────────────────────────────────────────────────────────────────────

import type { AllegroListing } from "../scrapers/allegro.scraper.js";

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export interface PriceAnalysis {
  readonly avg: number;
  readonly min: number;
  readonly max: number;
  readonly median: number;
}

export interface TopSeller {
  readonly sellerName: string;
  readonly listingsCount: number;
  readonly avgRating: number;
  readonly sharePercent: number;
}

export interface TrendDataPoint {
  readonly week: string;
  /** 0-100 relative search interest */
  readonly score: number;
}

export interface ScoreDimensions {
  /** 0-100, weighted 30% */
  readonly demand: number;
  /** 0-100, weighted 25% */
  readonly competition: number;
  /** 0-100, weighted 20% */
  readonly margin: number;
  /** 0-100, weighted 15% */
  readonly trend: number;
  /** 0-100, weighted 10% */
  readonly entryBarrier: number;
}

export type NicheRecommendation =
  | "highly_recommended"
  | "recommended"
  | "neutral"
  | "caution"
  | "not_recommended";

export interface SeasonalityEntry {
  readonly month: number;
  readonly monthName: string;
  readonly relativeScore: number;
}

export type NicheDataSource = "allegro_scrape" | "estimated";

export interface NicheAnalysisResult {
  readonly keyword: string;
  readonly score: number;
  readonly demand: number;
  readonly competition: number;
  readonly margin: number;
  readonly trend: number;
  readonly entryBarrier: number;
  readonly listings: AllegroListing[];
  readonly topSellers: TopSeller[];
  readonly priceAnalysis: PriceAnalysis;
  readonly trendData: TrendDataPoint[];
  readonly seasonality: SeasonalityEntry[];
  readonly recommendation: NicheRecommendation;
  readonly dataSource: NicheDataSource;
  readonly analyzedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Score weights — must sum to 1.0
// ─────────────────────────────────────────────────────────────────────────────

const WEIGHTS = {
  demand: 0.30,
  competition: 0.25,
  margin: 0.20,
  trend: 0.15,
  entryBarrier: 0.10,
} as const satisfies Record<keyof ScoreDimensions, number>;

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute median of a sorted numeric array.
 * Returns 0 for empty arrays.
 */
function median(sortedValues: readonly number[]): number {
  if (sortedValues.length === 0) return 0;
  const mid = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 0) {
    const a = sortedValues[mid - 1] ?? 0;
    const b = sortedValues[mid] ?? 0;
    return (a + b) / 2;
  }
  return sortedValues[mid] ?? 0;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Price analysis
// ─────────────────────────────────────────────────────────────────────────────

function computePriceAnalysis(listings: readonly AllegroListing[]): PriceAnalysis {
  if (listings.length === 0) {
    return { avg: 0, min: 0, max: 0, median: 0 };
  }

  const prices = listings.map((l) => l.price).filter((p) => p > 0);
  if (prices.length === 0) {
    return { avg: 0, min: 0, max: 0, median: 0 };
  }

  const sorted = [...prices].sort((a, b) => a - b);

  return {
    avg: Math.round(average(prices) * 100) / 100,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    median: Math.round(median(sorted) * 100) / 100,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Top seller analysis
// ─────────────────────────────────────────────────────────────────────────────

function computeTopSellers(listings: readonly AllegroListing[]): TopSeller[] {
  if (listings.length === 0) return [];

  const sellerMap = new Map<
    string,
    { listingsCount: number; ratingSum: number; ratingCount: number }
  >();

  for (const listing of listings) {
    const existing = sellerMap.get(listing.sellerName);
    if (existing !== undefined) {
      existing.listingsCount += 1;
      if (listing.sellerRating > 0) {
        existing.ratingSum += listing.sellerRating;
        existing.ratingCount += 1;
      }
    } else {
      sellerMap.set(listing.sellerName, {
        listingsCount: 1,
        ratingSum: listing.sellerRating > 0 ? listing.sellerRating : 0,
        ratingCount: listing.sellerRating > 0 ? 1 : 0,
      });
    }
  }

  const total = listings.length;
  const sellers = Array.from(sellerMap.entries())
    .map(([sellerName, data]) => ({
      sellerName,
      listingsCount: data.listingsCount,
      avgRating:
        data.ratingCount > 0
          ? Math.round((data.ratingSum / data.ratingCount) * 100) / 100
          : 0,
      sharePercent: Math.round((data.listingsCount / total) * 10000) / 100,
    }))
    .sort((a, b) => b.listingsCount - a.listingsCount)
    .slice(0, 10);

  return sellers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimension calculators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Demand score (0-100)
 * Formula: log10(listingsCount) * 15 + googleTrendScore * 0.4
 * Clamped to [0, 100].
 */
function computeDemandScore(listingsCount: number, googleTrendScore: number): number {
  if (listingsCount <= 0) return 0;
  const logPart = Math.log10(listingsCount) * 15;
  const trendPart = googleTrendScore * 0.4;
  return clamp(logPart + trendPart, 0, 100);
}

/**
 * Competition score (0-100)
 * Formula: 100 - topSellerShare * 1.5
 * Higher share of top sellers = lower competition score (harder to enter).
 */
function computeCompetitionScore(topSellers: readonly TopSeller[]): number {
  if (topSellers.length === 0) return 100;
  const top3ShareSum = topSellers
    .slice(0, 3)
    .reduce((acc, s) => acc + s.sharePercent, 0);
  return clamp(100 - top3ShareSum * 1.5, 0, 100);
}

/**
 * Margin score (0-100)
 * Assumes ~35% cost from China.
 * Higher avg price = more absolute margin headroom.
 * Formula: normalizes avg price against a 500 PLN reference ceiling.
 */
function computeMarginScore(avgPrice: number): number {
  if (avgPrice <= 0) return 0;
  // Estimated selling margin after 35% COGS
  const estimatedMarginPct = 0.65; // 65% remaining after China cost
  // Normalize: PLN 500+ avg price = max margin score
  const priceScore = clamp(avgPrice / 500, 0, 1);
  return clamp(priceScore * 100 * estimatedMarginPct, 0, 100);
}

/**
 * Trend score (0-100) — direct pass-through of Google Trends score.
 */
function computeTrendScore(googleTrendScore: number): number {
  return clamp(googleTrendScore, 0, 100);
}

/**
 * Entry barrier score (0-100) — INVERSE of difficulty.
 * Lower avg price and lower min order = easier entry = higher score.
 * Formula: uses inverse of avg price normalized to 0-100.
 */
function computeEntryBarrierScore(avgPrice: number): number {
  if (avgPrice <= 0) return 100;
  // Reference: PLN 1000 = near-zero score (high barrier), PLN 10 = near-100 (easy entry)
  const normalized = clamp(1 - avgPrice / 1000, 0, 1);
  return clamp(normalized * 100, 0, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite NicheScore
// ─────────────────────────────────────────────────────────────────────────────

function computeNicheScore(dimensions: ScoreDimensions): number {
  const weighted =
    dimensions.demand * WEIGHTS.demand +
    dimensions.competition * WEIGHTS.competition +
    dimensions.margin * WEIGHTS.margin +
    dimensions.trend * WEIGHTS.trend +
    dimensions.entryBarrier * WEIGHTS.entryBarrier;

  return Math.round(clamp(weighted, 0, 100) * 10) / 10;
}

function deriveRecommendation(score: number): NicheRecommendation {
  if (score >= 75) return "highly_recommended";
  if (score >= 60) return "recommended";
  if (score >= 45) return "neutral";
  if (score >= 30) return "caution";
  return "not_recommended";
}

// ─────────────────────────────────────────────────────────────────────────────
// Trend data synthesis
// Generates synthetic weekly trend data from a single Google Trends score
// since real Google Trends integration is handled externally.
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function buildTrendData(googleTrendScore: number): TrendDataPoint[] {
  const now = new Date();
  const points: TrendDataPoint[] = [];

  for (let i = 11; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i * 7);

    // Simulate natural fluctuation around the baseline trend score
    const noise = (Math.random() - 0.5) * 20;
    const score = clamp(Math.round(googleTrendScore + noise), 0, 100);

    const week = date.toISOString().slice(0, 10);
    points.push({ week, score });
  }

  return points;
}

function buildSeasonality(googleTrendScore: number): SeasonalityEntry[] {
  // Seasonal multipliers based on typical Polish e-commerce patterns
  const SEASONAL_MULTIPLIERS = [
    0.80, // Jan — post-holiday slump
    0.75, // Feb
    0.85, // Mar
    0.90, // Apr
    0.95, // May
    0.85, // Jun
    0.80, // Jul
    0.85, // Aug — back to school prep
    0.95, // Sep — back to school
    1.00, // Oct
    1.10, // Nov — Black Friday
    1.20, // Dec — Christmas peak
  ] as const;

  return SEASONAL_MULTIPLIERS.map((multiplier, idx) => ({
    month: idx + 1,
    monthName: MONTH_NAMES[idx] ?? "Unknown",
    relativeScore: Math.round(clamp(googleTrendScore * multiplier, 0, 100) * 10) / 10,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Estimated analysis (used when scraper returns zero listings)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deterministic hash of a string — maps any keyword to a stable 0-99 seed
 * so the same keyword always produces the same estimated scores.
 */
function keywordSeed(keyword: string): number {
  return keyword.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 100;
}

function generateEstimatedTrendData(seed: number): TrendDataPoint[] {
  const now = new Date();
  const points: TrendDataPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i * 7);
    // Deterministic noise derived from seed and week index
    const noise = ((seed * (i + 1)) % 21) - 10;
    const score = clamp(Math.round(40 + (seed % 40) + noise), 0, 100);
    points.push({ week: date.toISOString().slice(0, 10), score });
  }
  return points;
}

function generateEstimatedAnalysis(keyword: string): NicheAnalysisResult {
  const seed = keywordSeed(keyword);

  const score = 30 + (seed % 40);
  const demand = 20 + ((seed * 7) % 60);
  const competition = 30 + ((seed * 3) % 50);
  const margin = 15 + ((seed * 5) % 55);
  const trendScore = 25 + ((seed * 11) % 50);
  const entryBarrier = 20 + ((seed * 2) % 40);

  const avgPrice = 50 + seed * 2;
  const priceAnalysis: PriceAnalysis = {
    avg: avgPrice,
    min: 20 + seed,
    max: 100 + seed * 3,
    median: 45 + seed * 2,
  };

  let recommendation: NicheRecommendation;
  if (score >= 60) {
    recommendation = "recommended";
  } else if (score >= 45) {
    recommendation = "neutral";
  } else {
    recommendation = "caution";
  }

  return {
    keyword,
    score: Math.round(score * 10) / 10,
    demand: Math.round(demand * 10) / 10,
    competition: Math.round(competition * 10) / 10,
    margin: Math.round(margin * 10) / 10,
    trend: Math.round(trendScore * 10) / 10,
    entryBarrier: Math.round(entryBarrier * 10) / 10,
    listings: [],
    topSellers: [],
    priceAnalysis,
    trendData: generateEstimatedTrendData(seed),
    seasonality: buildSeasonality(trendScore),
    recommendation,
    dataSource: "estimated",
    analyzedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface ScoringInput {
  readonly keyword: string;
  readonly listings: readonly AllegroListing[];
  /** 0-100 score from Google Trends API */
  readonly googleTrendScore: number;
}

/**
 * Compute a full NicheAnalysisResult from raw scraper listings
 * and a Google Trends score (0-100).
 */
export function computeNicheAnalysis(input: ScoringInput): NicheAnalysisResult {
  const { keyword, listings, googleTrendScore } = input;

  // Fall back to keyword-derived estimates when the scraper returned nothing.
  if (listings.length === 0) {
    return generateEstimatedAnalysis(keyword);
  }

  const priceAnalysis = computePriceAnalysis(listings);
  const topSellers = computeTopSellers(listings);

  const demand = computeDemandScore(listings.length, googleTrendScore);
  const competition = computeCompetitionScore(topSellers);
  const margin = computeMarginScore(priceAnalysis.avg);
  const trend = computeTrendScore(googleTrendScore);
  const entryBarrier = computeEntryBarrierScore(priceAnalysis.avg);

  const dimensions: ScoreDimensions = {
    demand,
    competition,
    margin,
    trend,
    entryBarrier,
  };

  const score = computeNicheScore(dimensions);
  const recommendation = deriveRecommendation(score);

  return {
    keyword,
    score,
    demand: Math.round(demand * 10) / 10,
    competition: Math.round(competition * 10) / 10,
    margin: Math.round(margin * 10) / 10,
    trend: Math.round(trend * 10) / 10,
    entryBarrier: Math.round(entryBarrier * 10) / 10,
    listings: [...listings],
    topSellers,
    priceAnalysis,
    trendData: buildTrendData(googleTrendScore),
    seasonality: buildSeasonality(googleTrendScore),
    recommendation,
    dataSource: "allegro_scrape",
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Compute only the top3 seller share percentage.
 * Used by the ClickHouse writer.
 */
export function computeTop3SellerShare(listings: readonly AllegroListing[]): number {
  const topSellers = computeTopSellers(listings);
  return topSellers
    .slice(0, 3)
    .reduce((acc, s) => acc + s.sharePercent, 0);
}
