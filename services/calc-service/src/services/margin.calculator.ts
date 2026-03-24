// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — calc-service
// Margin calculator — all arithmetic via Decimal.js (no floating-point errors)
// ─────────────────────────────────────────────────────────────────────────────

import { Decimal } from "decimal.js";

// Configure Decimal globally for this module
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// ─── Input / Output types ────────────────────────────────────────────────────

export interface MarginInput {
  /** Purchase price per unit in PLN (from supplier) */
  readonly purchasePricePln: number;
  /** Total shipping cost from China per unit in PLN */
  readonly shippingFromChina: number;
  /** Customs duty as percentage (e.g. 5 = 5%) */
  readonly customsDutyPct: number;
  /** VAT rate — defaults to 23% (Polish standard) */
  readonly vatRatePct?: number | undefined;
  /** Allegro commission percentage (0–15) */
  readonly allegroCommissionPct: number;
  /** Allegro Ads (sponsored) spend per unit in PLN */
  readonly allegroAdsCost: number;
  /** Expected return rate as percentage (e.g. 3 = 3%) */
  readonly returnRatePct: number;
  /** Selling price on Allegro in PLN */
  readonly sellingPricePln: number;
  /** Number of units in the batch */
  readonly quantity: number;
}

export type MarginRecommendation =
  | "Хорошая маржа ≥20%"
  | "Низкая маржа ≥10%"
  | "Убыток <10%";

export interface MarginBreakdown {
  /** Purchase cost per unit in PLN */
  readonly purchase: string;
  /** Shipping cost per unit in PLN */
  readonly shipping: string;
  /** Customs duty cost per unit in PLN */
  readonly customs: string;
  /** VAT cost component per unit in PLN */
  readonly vat: string;
  /** Allegro commission per unit in PLN */
  readonly commission: string;
  /** Allegro Ads cost per unit in PLN */
  readonly ads: string;
  /** Return-rate provision per unit in PLN */
  readonly returns: string;
}

export interface MarginResult {
  /** Sum of all cost components per unit in PLN */
  readonly totalCostPerUnit: string;
  /** Selling price minus Allegro commission (excl. VAT) in PLN */
  readonly netRevenue: string;
  /** netRevenue minus non-VAT costs in PLN */
  readonly grossProfit: string;
  /** netRevenue minus ALL costs in PLN */
  readonly netProfit: string;
  /** Net profit / selling price * 100 (%) */
  readonly marginPct: string;
  /** Net profit / totalCostPerUnit * 100 (%) */
  readonly roi: string;
  /** Units needed to cover total batch cost */
  readonly breakeven: string;
  /** Actionable recommendation */
  readonly recommendation: MarginRecommendation;
  /** Per-unit cost breakdown in PLN */
  readonly breakdown: MarginBreakdown;
}

// ─── Calculator ──────────────────────────────────────────────────────────────

export function calculateMargin(input: MarginInput): MarginResult {
  const {
    purchasePricePln,
    shippingFromChina,
    customsDutyPct,
    vatRatePct = 23,
    allegroCommissionPct,
    allegroAdsCost,
    returnRatePct,
    sellingPricePln,
    quantity,
  } = input;

  // Lift all inputs into Decimal
  const purchase = new Decimal(purchasePricePln);
  const shipping = new Decimal(shippingFromChina);
  const customsPct = new Decimal(customsDutyPct);
  const vatPct = new Decimal(vatRatePct);
  const commissionPct = new Decimal(allegroCommissionPct);
  const adsCost = new Decimal(allegroAdsCost);
  const returnPct = new Decimal(returnRatePct);
  const sellingPrice = new Decimal(sellingPricePln);
  const qty = new Decimal(quantity);

  // ── Cost components (all per unit) ──────────────────────────────────────────

  // Customs duty is applied to (purchase + shipping)
  const customsBase = purchase.plus(shipping);
  const customs = customsBase.mul(customsPct).div(100);

  // Polish import VAT: (purchase + shipping + customs) * vatPct%
  const vatBase = customsBase.plus(customs);
  const vat = vatBase.mul(vatPct).div(100);

  // Allegro commission on selling price
  const commission = sellingPrice.mul(commissionPct).div(100);

  // Return provision: selling price * returnPct% (expected refund cost)
  const returns = sellingPrice.mul(returnPct).div(100);

  // Total cost per unit
  const totalCostPerUnit = purchase
    .plus(shipping)
    .plus(customs)
    .plus(vat)
    .plus(commission)
    .plus(adsCost)
    .plus(returns);

  // ── Revenue & profit ────────────────────────────────────────────────────────

  // Net revenue = selling price minus commission (what actually lands in wallet before cost deduction)
  const netRevenue = sellingPrice.minus(commission);

  // Gross profit = selling price minus non-VAT/non-return operating costs
  const grossProfit = sellingPrice
    .minus(purchase)
    .minus(shipping)
    .minus(customs)
    .minus(commission)
    .minus(adsCost);

  // Net profit per unit = net revenue minus ALL costs
  const netProfit = sellingPrice.minus(totalCostPerUnit);

  // ── Ratios ──────────────────────────────────────────────────────────────────

  // Margin % = net profit / selling price * 100
  const marginPct = sellingPrice.isZero()
    ? new Decimal(0)
    : netProfit.div(sellingPrice).mul(100);

  // ROI % = net profit / total cost * 100
  const roi = totalCostPerUnit.isZero()
    ? new Decimal(0)
    : netProfit.div(totalCostPerUnit).mul(100);

  // ── Breakeven (units) ────────────────────────────────────────────────────────
  // Breakeven = total batch cost / net profit per unit
  // Total batch cost = totalCostPerUnit * quantity (fixed + variable)
  // Solve: units * sellingPrice = units * totalCostPerUnit
  //        → breakeven = totalBatchFixedCost / netProfitPerUnit
  // Here we treat it as: how many units must sell to recoup total investment
  const totalBatchCost = totalCostPerUnit.mul(qty);
  const breakeven = netProfit.isZero()
    ? new Decimal(Infinity)
    : totalBatchCost.div(netProfit).ceil();

  // ── Recommendation ──────────────────────────────────────────────────────────
  const marginNum = marginPct.toNumber();
  const recommendation: MarginRecommendation =
    marginNum >= 20
      ? "Хорошая маржа ≥20%"
      : marginNum >= 10
        ? "Низкая маржа ≥10%"
        : "Убыток <10%";

  // ── Serialise to fixed-2 strings ────────────────────────────────────────────
  return {
    totalCostPerUnit: totalCostPerUnit.toFixed(2),
    netRevenue: netRevenue.toFixed(2),
    grossProfit: grossProfit.toFixed(2),
    netProfit: netProfit.toFixed(2),
    marginPct: marginPct.toFixed(2),
    roi: roi.toFixed(2),
    breakeven: breakeven.isFinite() ? breakeven.toFixed(0) : "∞",
    recommendation,
    breakdown: {
      purchase: purchase.toFixed(2),
      shipping: shipping.toFixed(2),
      customs: customs.toFixed(2),
      vat: vat.toFixed(2),
      commission: commission.toFixed(2),
      ads: adsCost.toFixed(2),
      returns: returns.toFixed(2),
    },
  };
}
