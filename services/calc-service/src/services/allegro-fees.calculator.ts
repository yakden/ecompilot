// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — calc-service
// Allegro fees calculator — all arithmetic via Decimal.js
// Commission rates reflect Allegro's 2024/2025 tariff
// ─────────────────────────────────────────────────────────────────────────────

import { Decimal } from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// ─── Category commission table ───────────────────────────────────────────────

export const ALLEGRO_CATEGORY_COMMISSIONS = {
  Electronics: new Decimal("8.5"),
  Fashion: new Decimal("12"),
  "Home & Garden": new Decimal("10"),
  Sports: new Decimal("9.5"),
  Auto: new Decimal("7"),
  Books: new Decimal("15"),
  Beauty: new Decimal("10"),
  Kids: new Decimal("11"),
  "Food & Health": new Decimal("8"),
  Toys: new Decimal("11"),
  "Tools & DIY": new Decimal("9"),
  Collectibles: new Decimal("10"),
  "Musical Instruments": new Decimal("9"),
  "Pet Supplies": new Decimal("8.5"),
  Other: new Decimal("10"),
} as const satisfies Record<string, Decimal>;

export type AllegroCategory = keyof typeof ALLEGRO_CATEGORY_COMMISSIONS;

/** Allegro Smart! seller programme discount on commission (percentage points off) */
const SMART_DISCOUNT_PP = new Decimal("1"); // 1 percentage point reduction

// ─── Input / Output types ────────────────────────────────────────────────────

export interface AllegroFeesInput {
  /** Product category — must match one of the defined categories */
  readonly category: AllegroCategory;
  /** Listed selling price in PLN */
  readonly sellingPricePln: number;
  /** Whether the seller participates in Allegro Smart! programme */
  readonly isSmartSeller: boolean;
}

export interface AllegroFeesResult {
  /** Commission rate applied (%) */
  readonly commissionPct: string;
  /** Commission amount in PLN */
  readonly commissionPln: string;
  /** Amount received after deducting commission in PLN */
  readonly netAfterCommission: string;
  /** Discount applied for Smart! sellers in PLN (0 if not applicable) */
  readonly smartDiscount: string;
}

// ─── Calculator ──────────────────────────────────────────────────────────────

export function calculateAllegroFees(input: AllegroFeesInput): AllegroFeesResult {
  const { category, sellingPricePln, isSmartSeller } = input;

  const price = new Decimal(sellingPricePln);
  const baseCommissionPct = ALLEGRO_CATEGORY_COMMISSIONS[category];

  // Apply Smart! discount if applicable — floor at 0%
  const effectivePct = isSmartSeller
    ? Decimal.max(baseCommissionPct.minus(SMART_DISCOUNT_PP), new Decimal(0))
    : baseCommissionPct;

  const baseCommission = price.mul(baseCommissionPct).div(100);
  const effectiveCommission = price.mul(effectivePct).div(100);
  const smartDiscount = baseCommission.minus(effectiveCommission);
  const netAfterCommission = price.minus(effectiveCommission);

  return {
    commissionPct: effectivePct.toFixed(2),
    commissionPln: effectiveCommission.toFixed(2),
    netAfterCommission: netAfterCommission.toFixed(2),
    smartDiscount: smartDiscount.toFixed(2),
  };
}

/** Returns all available categories with their base commission rates */
export function getAllegroCategories(): ReadonlyArray<{
  category: AllegroCategory;
  commissionPct: string;
}> {
  return (Object.keys(ALLEGRO_CATEGORY_COMMISSIONS) as AllegroCategory[]).map(
    (category) => ({
      category,
      commissionPct: ALLEGRO_CATEGORY_COMMISSIONS[category].toFixed(2),
    }),
  );
}
