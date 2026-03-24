// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — inventory-service
// Dead Stock Detection — identify slow-moving and dead inventory
//
// Definitions:
//   slow_moving — no sales in last 30 days
//   dead_stock  — no sales in last 60 days
//
// Holding cost assumption: 2% of purchase price per month
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, isNull, lt } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { products, type Product } from "../db/schema.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Monthly holding cost as a fraction of purchase price (2% per month). */
const HOLDING_COST_RATE = 0.02;

// ─── Return types ─────────────────────────────────────────────────────────────

export type DeadStockAction =
  | "discount_sell"
  | "bundle"
  | "liquidate"
  | "return_to_supplier";

export interface ProductRecommendation {
  readonly productId: string;
  readonly sku: string;
  readonly productName: string;
  readonly category: string;
  readonly currentStock: number;
  readonly purchasePrice: number;
  /** Monthly holding cost in grosze for all units of this product. */
  readonly monthlyHoldingCost: number;
  /** Days since last sale (null = never sold). */
  readonly daysSinceLastSale: number | null;
  readonly action: DeadStockAction;
  readonly actionReason: string;
}

export interface DeadStockResult {
  readonly deadStock: readonly Product[];
  readonly slowMoving: readonly Product[];
  /** Total monthly holding cost across all dead + slow-moving products (grosze). */
  readonly totalHoldingCost: number;
  readonly recommendations: readonly ProductRecommendation[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function analyzeDeadStock(
  userId: string,
): Promise<DeadStockResult> {
  const db = getDb();

  const now = new Date();

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  // ── Dead stock: no sales in 60+ days or never sold ──────────────────────
  const deadStockRows = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.userId, userId),
        // Either never sold or last sale was 60+ days ago
        lt(products.currentStock, 999999), // always true — keep for composability
        // We need products where lastSoldAt < 60 days ago OR is null
        // We use a raw condition via lt for lastSoldAt and isNull
      ),
    );

  // Filter in application layer for clarity and strict type safety
  const deadStock = deadStockRows.filter((p) => {
    if (p.lastSoldAt === null) return true;
    return p.lastSoldAt.getTime() < sixtyDaysAgo.getTime();
  });

  // ── Slow moving: no sales in 30–59 days (not already dead) ──────────────
  const slowMovingCandidates = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.userId, userId),
        lt(products.currentStock, 999999), // always true
      ),
    );

  const deadStockIds = new Set(deadStock.map((p) => p.id));

  const slowMoving = slowMovingCandidates.filter((p) => {
    if (deadStockIds.has(p.id)) return false;
    if (p.lastSoldAt === null) return false; // already in dead stock
    return p.lastSoldAt.getTime() < thirtyDaysAgo.getTime();
  });

  // ── Combine for cost and recommendation analysis ──────────────────────────
  const allProblematic = [...deadStock, ...slowMoving];

  const recommendations: ProductRecommendation[] = allProblematic.map((p) => {
    const daysSinceLastSale =
      p.lastSoldAt !== null
        ? Math.floor(
            (now.getTime() - p.lastSoldAt.getTime()) / (1000 * 60 * 60 * 24),
          )
        : null;

    const monthlyHoldingCost = Math.round(
      p.purchasePrice * p.currentStock * HOLDING_COST_RATE,
    );

    const isDead = deadStockIds.has(p.id);

    let action: DeadStockAction;
    let actionReason: string;

    if (p.currentStock === 0) {
      // No stock left — no action needed
      action = "liquidate";
      actionReason =
        "Produkt wyprzedany — rozważ usunięcie z katalogu lub zastąpienie nową wersją.";
    } else if (isDead && (daysSinceLastSale ?? 0) >= 90) {
      action = "liquidate";
      actionReason = `Brak sprzedaży przez ${String(daysSinceLastSale ?? 0)} dni. Koszt utrzymania: ${(monthlyHoldingCost / 100).toFixed(2)} PLN/mies. Zlikwiduj zapas przez wyprzedaż zbiorczą lub zwrot do dostawcy.`;
    } else if (isDead) {
      action = "discount_sell";
      actionReason = `Martwy zapas (${String(daysSinceLastSale ?? 0)} dni bez sprzedaży). Obniż cenę o 20–40% aby odblokować gotówkę. Koszt utrzymania: ${(monthlyHoldingCost / 100).toFixed(2)} PLN/mies.`;
    } else {
      // Slow moving — try bundling first
      action = "bundle";
      actionReason = `Wolno rotujący (${String(daysSinceLastSale ?? 0)} dni bez sprzedaży). Rozważ bundle z popularnym produktem lub promocję sezonową.`;
    }

    return {
      productId: p.id,
      sku: p.sku,
      productName: p.name,
      category: p.category,
      currentStock: p.currentStock,
      purchasePrice: p.purchasePrice,
      monthlyHoldingCost,
      daysSinceLastSale,
      action,
      actionReason,
    };
  });

  const totalHoldingCost = recommendations.reduce(
    (sum, r) => sum + r.monthlyHoldingCost,
    0,
  );

  return {
    deadStock,
    slowMoving,
    totalHoldingCost,
    recommendations,
  };
}
