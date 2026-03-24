// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — inventory-service
// Demand Forecasting — 90-day rolling average with Polish seasonal multipliers
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { inventorySnapshots, products } from "../db/schema.js";

// ─── Seasonal multipliers (Polish e-commerce) ─────────────────────────────────

/**
 * Month-indexed seasonal multipliers (index 0 = January, 11 = December).
 * Source: Polish e-commerce seasonal patterns.
 */
const SEASONAL_MULTIPLIERS: readonly number[] = [
  0.7,  // January  — post-holiday slump
  0.85, // February — recovery
  0.9,  // March    — slight spring pickup
  1.0,  // April    — baseline
  1.0,  // May      — baseline
  0.9,  // June     — summer slowdown begins
  0.8,  // July     — summer trough
  0.85, // August   — late summer
  0.95, // September — back-to-school
  1.05, // October  — pre-holiday ramp
  1.2,  // November — Black Friday / pre-Christmas
  1.3,  // December — peak Christmas season
] as const;

// ─── Return type ──────────────────────────────────────────────────────────────

export interface ForecastResult {
  readonly productId: string;
  readonly productName: string;
  readonly currentStock: number;
  /** Average units sold per calendar day over the last 90 days */
  readonly dailyRate: number;
  /** Forecasted units for the next 7 days (seasonally adjusted) */
  readonly weeklyForecast: number;
  /** Forecasted units for the next 30 days (seasonally adjusted) */
  readonly monthlyForecast: number;
  /** Estimated days until stock reaches zero at current demand */
  readonly daysUntilStockout: number | null;
  /** ISO date string of recommended reorder date (stockout minus lead time) */
  readonly recommendedReorderDate: string | null;
  /** Seasonal multiplier applied for the current month */
  readonly seasonalFactor: number;
  /** Total units sold in the last 90 days */
  readonly soldLast90Days: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function forecastProduct(
  productId: string,
  userId: string,
): Promise<ForecastResult> {
  const db = getDb();

  // Verify product belongs to the user
  const productRows = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.userId, userId)));

  const product = productRows[0];
  if (product === undefined) {
    throw new Error(`Product ${productId} not found for user ${userId}`);
  }

  // Fetch last 90 days of snapshots
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split("T")[0]
    ?? ninetyDaysAgo.toISOString().substring(0, 10);

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0]
    ?? today.toISOString().substring(0, 10);

  const snapshots = await db
    .select()
    .from(inventorySnapshots)
    .where(
      and(
        eq(inventorySnapshots.productId, productId),
        gte(inventorySnapshots.date, ninetyDaysAgoStr),
        lte(inventorySnapshots.date, todayStr),
      ),
    );

  const totalSoldLast90 = snapshots.reduce((s, snap) => s + snap.soldCount, 0);
  const daysWithData = snapshots.length > 0 ? snapshots.length : 1;
  const dailyRate = totalSoldLast90 / daysWithData;

  // Apply seasonal factor for the current month (0-indexed)
  const currentMonth = today.getMonth();
  const seasonalFactor = SEASONAL_MULTIPLIERS[currentMonth] ?? 1.0;

  const adjustedDailyRate = dailyRate * seasonalFactor;

  const weeklyForecast = Math.round(adjustedDailyRate * 7);
  const monthlyForecast = Math.round(adjustedDailyRate * 30);

  // Available stock = current - reserved
  const availableStock = Math.max(
    0,
    product.currentStock - product.reservedStock,
  );

  let daysUntilStockout: number | null = null;
  let recommendedReorderDate: string | null = null;

  if (adjustedDailyRate > 0) {
    daysUntilStockout = Math.floor(availableStock / adjustedDailyRate);

    // Reorder date = stockout date - lead time days
    const reorderDaysFromNow = Math.max(
      0,
      daysUntilStockout - product.leadTimeDays,
    );
    const reorderDate = new Date();
    reorderDate.setDate(reorderDate.getDate() + reorderDaysFromNow);
    recommendedReorderDate = reorderDate.toISOString().split("T")[0]
      ?? reorderDate.toISOString().substring(0, 10);
  }

  return {
    productId: product.id,
    productName: product.name,
    currentStock: product.currentStock,
    dailyRate: Math.round(dailyRate * 100) / 100,
    weeklyForecast,
    monthlyForecast,
    daysUntilStockout,
    recommendedReorderDate,
    seasonalFactor,
    soldLast90Days: totalSoldLast90,
  };
}
