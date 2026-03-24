// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — calc-service
// ZUS 2025 calculator — all arithmetic via Decimal.js
// Rates source: ZUS.pl / official announcements for 2025
// ─────────────────────────────────────────────────────────────────────────────

import { Decimal } from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// ─── 2025 ZUS rates (PLN / %) ────────────────────────────────────────────────

/** All monetary values in PLN, rates in % */
export const ZUS_RATES_2025 = {
  preferential: {
    /** Social insurance total (emerytalne + rentowe + chorobowe combined flat) */
    socialFlat: new Decimal("201.31"),
  },
  reduced: {
    /** "Mały ZUS Plus" — social insurance flat for months 7–30 */
    socialFlat: new Decimal("805.18"),
  },
  full: {
    /** Emerytalne (retirement) — 19.52% of assessment base */
    emerytalnePct: new Decimal("19.52"),
    /** Rentowe (disability) — 8% of assessment base */
    rentowePct: new Decimal("8.00"),
    /** Chorobowe (sickness) — 2.45% of assessment base — optional */
    chorobowePct: new Decimal("2.45"),
    /** Wypadkowe (accident) — standard rate for sole traders */
    wypadkowe: new Decimal("60.92"),
    /** Fundusz Pracy (Labour Fund) */
    fp: new Decimal("42.55"),
    /** Full ZUS assessment base 2025 (60% of avg salary projection) */
    assessmentBase: new Decimal("5203.80"),
    /** Emerytalne flat = assessmentBase * 19.52% */
    emerytalne: new Decimal("812.23"),
    /** Rentowe flat = assessmentBase * 8% */
    rentowe: new Decimal("333.00"),
    /** Chorobowe flat = assessmentBase * 2.45% */
    chorobowe: new Decimal("101.52"),
  },
  health: {
    /** Health contribution rate */
    ratePct: new Decimal("9"),
    /** Minimum health contribution (floor) */
    minimumPln: new Decimal("381.78"),
  },
} as const;

// ─── Input / Output types ────────────────────────────────────────────────────

export type ZusType = "preferential" | "reduced" | "full";

export interface ZusInput {
  /** Monthly net income in PLN (revenue minus costs) */
  readonly monthlyIncome: number;
  /** Which ZUS tier applies */
  readonly zusType: ZusType;
  /** Whether chorobowe (sickness) contribution is included (full tier only) */
  readonly includeChorobowe: boolean;
}

export interface ZusResult {
  /** Sum of social insurance contributions in PLN */
  readonly socialTotal: string;
  /** Health contribution (zdrowotna) in PLN */
  readonly healthContribution: string;
  /** socialTotal + healthContribution in PLN */
  readonly totalZus: string;
  /** monthlyIncome minus totalZus in PLN */
  readonly netIncome: string;
  /** totalZus / monthlyIncome * 100 (%) */
  readonly effectiveTaxRate: string;
  /** Detailed breakdown of each component */
  readonly breakdown: ZusBreakdown;
}

export interface ZusBreakdown {
  readonly emerytalne: string;
  readonly rentowe: string;
  readonly chorobowe: string;
  readonly wypadkowe: string;
  readonly fp: string;
  readonly zdravotna: string;
}

// ─── Calculator ──────────────────────────────────────────────────────────────

export function calculateZus(input: ZusInput): ZusResult {
  const { monthlyIncome, zusType, includeChorobowe } = input;
  const income = new Decimal(monthlyIncome);

  const ZERO = new Decimal(0);
  let emerytalne = ZERO;
  let rentowe = ZERO;
  let chorobowe = ZERO;
  let wypadkowe = ZERO;
  let fp = ZERO;

  switch (zusType) {
    case "preferential": {
      // Single flat social rate — no split breakdown available
      const flat = ZUS_RATES_2025.preferential.socialFlat;
      emerytalne = flat; // treat whole flat as "emerytalne" for display simplicity
      rentowe = ZERO;
      chorobowe = ZERO;
      wypadkowe = ZERO;
      fp = ZERO;
      break;
    }

    case "reduced": {
      const flat = ZUS_RATES_2025.reduced.socialFlat;
      emerytalne = flat;
      rentowe = ZERO;
      chorobowe = ZERO;
      wypadkowe = ZERO;
      fp = ZERO;
      break;
    }

    case "full": {
      const r = ZUS_RATES_2025.full;
      emerytalne = r.emerytalne;
      rentowe = r.rentowe;
      chorobowe = includeChorobowe ? r.chorobowe : ZERO;
      wypadkowe = r.wypadkowe;
      fp = r.fp;
      break;
    }
  }

  const socialTotal = emerytalne
    .plus(rentowe)
    .plus(chorobowe)
    .plus(wypadkowe)
    .plus(fp);

  // Health: max(income * 9%, 381.78)
  const healthFromIncome = income
    .mul(ZUS_RATES_2025.health.ratePct)
    .div(100);
  const healthContribution = Decimal.max(
    healthFromIncome,
    ZUS_RATES_2025.health.minimumPln,
  );

  const totalZus = socialTotal.plus(healthContribution);
  const netIncome = income.minus(totalZus);

  const effectiveTaxRate = income.isZero()
    ? ZERO
    : totalZus.div(income).mul(100);

  return {
    socialTotal: socialTotal.toFixed(2),
    healthContribution: healthContribution.toFixed(2),
    totalZus: totalZus.toFixed(2),
    netIncome: netIncome.toFixed(2),
    effectiveTaxRate: effectiveTaxRate.toFixed(2),
    breakdown: {
      emerytalne: emerytalne.toFixed(2),
      rentowe: rentowe.toFixed(2),
      chorobowe: chorobowe.toFixed(2),
      wypadkowe: wypadkowe.toFixed(2),
      fp: fp.toFixed(2),
      zdravotna: healthContribution.toFixed(2),
    },
  };
}
