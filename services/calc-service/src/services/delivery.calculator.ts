// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — calc-service
// China delivery cost calculator — all arithmetic via Decimal.js
// Exchange rate: 1 USD ≈ 4.00 PLN (configurable via rate config table)
// ─────────────────────────────────────────────────────────────────────────────

import { Decimal } from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// ─── Shipping rate tables ─────────────────────────────────────────────────────

export type ShippingMethod = "sea" | "train" | "air";

interface MethodSpec {
  /** Minimum cost per kg in USD */
  readonly minUsdPerKg: Decimal;
  /** Maximum cost per kg in USD */
  readonly maxUsdPerKg: Decimal;
  /** Transit time range in days */
  readonly minDays: number;
  readonly maxDays: number;
  /** Risk level descriptor */
  readonly riskLevel: "low" | "medium" | "high";
}

const SHIPPING_SPECS: Record<ShippingMethod, MethodSpec> = {
  sea: {
    minUsdPerKg: new Decimal("2"),
    maxUsdPerKg: new Decimal("4"),
    minDays: 40,
    maxDays: 60,
    riskLevel: "low",
  },
  train: {
    minUsdPerKg: new Decimal("4"),
    maxUsdPerKg: new Decimal("7"),
    minDays: 20,
    maxDays: 30,
    riskLevel: "medium",
  },
  air: {
    minUsdPerKg: new Decimal("8"),
    maxUsdPerKg: new Decimal("15"),
    minDays: 7,
    maxDays: 14,
    riskLevel: "high",
  },
};

/** Default USD → PLN exchange rate — should be overridden by rate_config table */
const DEFAULT_USD_PLN = new Decimal("4.00");

/**
 * Volumetric weight conversion: 1 m³ = 200 kg (industry standard for air/train).
 * Sea freight uses actual weight only.
 */
const VOLUMETRIC_FACTOR_KG_PER_M3 = new Decimal("200");

// Polish import thresholds (PLN)
// Customs duty: 0% below 150 EUR threshold (≈ 650 PLN), otherwise category-rate applies
// White import (formal customs clearance) uses full duty; grey import skips customs entirely
const WHITE_IMPORT_CUSTOMS_PCT = new Decimal("6.5"); // approximate average EU tariff for goods from China
const IMPORT_VAT_PCT = new Decimal("23");

// ─── Input / Output types ─────────────────────────────────────────────────────

export interface DeliveryInput {
  /** Physical weight in kilograms */
  readonly weightKg: number;
  /** Volumetric size in cubic metres */
  readonly volumeM3: number;
  /** Chosen shipping method */
  readonly method: ShippingMethod;
  /**
   * White import = formal Polish customs clearance (duties + VAT applied).
   * Grey import = informal — no duties modelled (higher seizure risk).
   */
  readonly isWhiteImport: boolean;
  /** Optional override for USD/PLN rate; falls back to DEFAULT_USD_PLN */
  readonly usdPlnRate?: number | undefined;
}

export interface DeliveryResult {
  /** Shipping cost in PLN */
  readonly shippingCost: string;
  /** Customs duty in PLN (0 for grey import) */
  readonly customsDuty: string;
  /** VAT on import in PLN (0 for grey import) */
  readonly vatOnImport: string;
  /** shippingCost + customsDuty + vatOnImport in PLN */
  readonly totalLandedCost: string;
  /** Estimated transit window */
  readonly estimatedDays: string;
  /** Qualitative risk label */
  readonly riskLevel: "low" | "medium" | "high";
  /** Mid-point cost per kg for the chosen method */
  readonly costPerKgUsd: string;
  /** Billing weight used (higher of actual vs volumetric for air/train) */
  readonly billingWeightKg: string;
}

// ─── Calculator ───────────────────────────────────────────────────────────────

export function calculateDelivery(input: DeliveryInput): DeliveryResult {
  const { weightKg, volumeM3, method, isWhiteImport, usdPlnRate } = input;

  const spec = SHIPPING_SPECS[method];
  const usdPln = usdPlnRate != null ? new Decimal(usdPlnRate) : DEFAULT_USD_PLN;

  const actualWeight = new Decimal(weightKg);
  const volumetricWeight = new Decimal(volumeM3).mul(VOLUMETRIC_FACTOR_KG_PER_M3);

  // Sea freight bills on actual weight; air and train bill on the higher of actual vs volumetric
  const billingWeight =
    method === "sea"
      ? actualWeight
      : Decimal.max(actualWeight, volumetricWeight);

  // Use midpoint of rate range for a realistic estimate
  const midUsdPerKg = spec.minUsdPerKg.plus(spec.maxUsdPerKg).div(2);
  const shippingCostUsd = midUsdPerKg.mul(billingWeight);
  const shippingCostPln = shippingCostUsd.mul(usdPln);

  let customsDuty = new Decimal(0);
  let vatOnImport = new Decimal(0);

  if (isWhiteImport) {
    // Customs duty on declared goods value (shipping cost as proxy)
    customsDuty = shippingCostPln.mul(WHITE_IMPORT_CUSTOMS_PCT).div(100);
    // Polish import VAT = (shipping + customs) * 23%
    vatOnImport = shippingCostPln.plus(customsDuty).mul(IMPORT_VAT_PCT).div(100);
  }

  const totalLandedCost = shippingCostPln.plus(customsDuty).plus(vatOnImport);

  return {
    shippingCost: shippingCostPln.toFixed(2),
    customsDuty: customsDuty.toFixed(2),
    vatOnImport: vatOnImport.toFixed(2),
    totalLandedCost: totalLandedCost.toFixed(2),
    estimatedDays: `${spec.minDays}–${spec.maxDays}`,
    riskLevel: isWhiteImport ? spec.riskLevel : "high",
    costPerKgUsd: midUsdPerKg.toFixed(2),
    billingWeightKg: billingWeight.toFixed(3),
  };
}
