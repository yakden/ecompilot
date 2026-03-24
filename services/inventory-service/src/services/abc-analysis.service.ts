// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — inventory-service
// ABC Analysis — Pareto-based product classification
//
// A class: top products constituting 80% of total revenue
// B class: next products constituting 15% of total revenue
// C class: remaining products constituting the final 5% of revenue
// ─────────────────────────────────────────────────────────────────────────────

import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { products, type Product } from "../db/schema.js";

// ─── Return types ─────────────────────────────────────────────────────────────

export interface AbcStats {
  readonly totalProducts: number;
  readonly totalRevenue: number;
  /** Percentage of products classified as A (0–100) */
  readonly aProductsPct: number;
  /** Percentage of products classified as B (0–100) */
  readonly bProductsPct: number;
  /** Percentage of products classified as C (0–100) */
  readonly cProductsPct: number;
  /** Percentage of revenue attributed to A products (0–100) */
  readonly aRevenuePct: number;
  /** Percentage of revenue attributed to B products (0–100) */
  readonly bRevenuePct: number;
  /** Percentage of revenue attributed to C products (0–100) */
  readonly cRevenuePct: number;
}

export interface AbcAnalysisResult {
  readonly classA: readonly Product[];
  readonly classB: readonly Product[];
  readonly classC: readonly Product[];
  readonly stats: AbcStats;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Run ABC classification for all products belonging to `userId`.
 * Updates the `abc_class` column on each product row and returns
 * the classified lists together with aggregate statistics.
 */
export async function runAbcAnalysis(
  userId: string,
): Promise<AbcAnalysisResult> {
  const db = getDb();

  // Fetch all products for the user
  const allProducts = await db
    .select()
    .from(products)
    .where(eq(products.userId, userId));

  if (allProducts.length === 0) {
    return buildEmptyResult();
  }

  // Sort by total revenue descending
  const sorted = [...allProducts].sort(
    (a, b) => b.totalRevenue - a.totalRevenue,
  );

  const totalRevenue = sorted.reduce((sum, p) => sum + p.totalRevenue, 0);

  // Cumulative revenue thresholds (Pareto)
  const thresholdA = totalRevenue * 0.8;
  const thresholdAB = totalRevenue * 0.95; // 80% + 15%

  const classA: Product[] = [];
  const classB: Product[] = [];
  const classC: Product[] = [];

  let cumulative = 0;

  for (const product of sorted) {
    cumulative += product.totalRevenue;

    let cls: "A" | "B" | "C";

    if (cumulative <= thresholdA || (classA.length === 0 && classB.length === 0)) {
      cls = "A";
      classA.push(product);
    } else if (cumulative <= thresholdAB) {
      cls = "B";
      classB.push(product);
    } else {
      cls = "C";
      classC.push(product);
    }

    // Update the product's abc_class in the DB
    await db
      .update(products)
      .set({ abcClass: cls, updatedAt: new Date() })
      .where(eq(products.id, product.id));
  }

  // Calculate revenue per class
  const revenueA = classA.reduce((s, p) => s + p.totalRevenue, 0);
  const revenueB = classB.reduce((s, p) => s + p.totalRevenue, 0);
  const revenueC = classC.reduce((s, p) => s + p.totalRevenue, 0);

  const n = sorted.length;
  const pct = (count: number): number =>
    n > 0 ? Math.round((count / n) * 1000) / 10 : 0;
  const revPct = (rev: number): number =>
    totalRevenue > 0
      ? Math.round((rev / totalRevenue) * 1000) / 10
      : 0;

  const stats: AbcStats = {
    totalProducts: n,
    totalRevenue,
    aProductsPct: pct(classA.length),
    bProductsPct: pct(classB.length),
    cProductsPct: pct(classC.length),
    aRevenuePct: revPct(revenueA),
    bRevenuePct: revPct(revenueB),
    cRevenuePct: revPct(revenueC),
  };

  // Re-query to return the updated rows
  const updatedProducts = await db
    .select()
    .from(products)
    .where(eq(products.userId, userId));

  const updatedA = updatedProducts.filter((p) => p.abcClass === "A");
  const updatedB = updatedProducts.filter((p) => p.abcClass === "B");
  const updatedC = updatedProducts.filter((p) => p.abcClass === "C");

  return { classA: updatedA, classB: updatedB, classC: updatedC, stats };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function buildEmptyResult(): AbcAnalysisResult {
  return {
    classA: [],
    classB: [],
    classC: [],
    stats: {
      totalProducts: 0,
      totalRevenue: 0,
      aProductsPct: 0,
      bProductsPct: 0,
      cProductsPct: 0,
      aRevenuePct: 0,
      bRevenuePct: 0,
      cRevenuePct: 0,
    },
  };
}
