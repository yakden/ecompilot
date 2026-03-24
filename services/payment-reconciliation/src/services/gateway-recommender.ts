// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — payment-reconciliation
// Gateway Recommender Service
//
// Recommends the optimal payment gateway based on:
//   1. Hard requirements (currency, BNPL, B2B, split)
//   2. Commission minimisation
//   3. Reliability score
//
// Decision tree (priority order):
//   B2B BNPL required              → imoje (only B2B BNPL via PragmaGO)
//   BNPL required (B2C)            → payu or tpay
//   Multi-currency (non-PLN)       → przelewy24 (PLN/EUR/GBP/CZK) or tpay (widest)
//   Marketplace split              → payu
//   PLN, low cost priority         → paynow (0.95%, no fixed fee)
//   PLN, reliability priority      → przelewy24 (94 score)
// ─────────────────────────────────────────────────────────────────────────────

import type {
  GatewayCapabilities,
  GatewayCode,
  GatewayRecommendation,
  GatewayRecommendationInput,
  SupportedCurrency,
} from "../types/payment.js";

// ─────────────────────────────────────────────────────────────────────────────
// Static capability registry — single source of truth for all gateways
// Keeps recommender independent from connector instances
// ─────────────────────────────────────────────────────────────────────────────

export const GATEWAY_CAPABILITIES: Readonly<Record<GatewayCode, GatewayCapabilities>> = {
  paynow: {
    code: "paynow",
    displayName: "Paynow",
    supportsBlik: true,
    supportsBlikRecurring: true,
    supportsCards: true,
    supportsBNPL: false,
    supportsB2BBNPL: false,
    supportsMultiCurrency: false,
    supportedCurrencies: ["PLN"],
    supportsMarketplaceSplit: false,
    webhookRetries: 15,
    commissionRate: 0.0095,
    fixedFeeGrosze: 0,
    isActive: true,
    reliabilityScore: 90,
  },
  przelewy24: {
    code: "przelewy24",
    displayName: "Przelewy24",
    supportsBlik: true,
    supportsBlikRecurring: false,
    supportsCards: true,
    supportsBNPL: false,
    supportsB2BBNPL: false,
    supportsMultiCurrency: true,
    supportedCurrencies: ["PLN", "EUR", "GBP", "CZK"],
    supportsMarketplaceSplit: false,
    webhookRetries: 3,
    commissionRate: 0.0129,
    fixedFeeGrosze: 30,
    isActive: true,
    reliabilityScore: 94,
  },
  payu: {
    code: "payu",
    displayName: "PayU",
    supportsBlik: true,
    supportsBlikRecurring: false,
    supportsCards: true,
    supportsBNPL: true,
    supportsB2BBNPL: false,
    supportsMultiCurrency: true,
    supportedCurrencies: ["PLN", "EUR", "CZK"],
    supportsMarketplaceSplit: true,
    webhookRetries: 5,
    commissionRate: 0.0159,
    fixedFeeGrosze: 25,
    isActive: true,
    reliabilityScore: 91,
  },
  tpay: {
    code: "tpay",
    displayName: "Tpay",
    supportsBlik: true,
    supportsBlikRecurring: false,
    supportsCards: true,
    supportsBNPL: true,
    supportsB2BBNPL: false,
    supportsMultiCurrency: true,
    supportedCurrencies: ["PLN", "EUR", "GBP", "USD", "CZK"],
    supportsMarketplaceSplit: false,
    webhookRetries: 5,
    commissionRate: 0.0139,
    fixedFeeGrosze: 25,
    isActive: true,
    reliabilityScore: 88,
  },
  imoje: {
    code: "imoje",
    displayName: "imoje (ING)",
    supportsBlik: true,
    supportsBlikRecurring: false,
    supportsCards: true,
    supportsBNPL: false,
    supportsB2BBNPL: true,
    supportsMultiCurrency: false,
    supportedCurrencies: ["PLN"],
    supportsMarketplaceSplit: false,
    webhookRetries: 5,
    commissionRate: 0.0149,
    fixedFeeGrosze: 0,
    isActive: true,
    reliabilityScore: 85,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Fee computation helper
// ─────────────────────────────────────────────────────────────────────────────

function computeFee(cap: GatewayCapabilities, amountGrosze: number): {
  feeGrosze: number;
  effectiveRatePercent: number;
} {
  const feeGrosze = Math.ceil(amountGrosze * cap.commissionRate) + cap.fixedFeeGrosze;
  const effectiveRatePercent = (feeGrosze / amountGrosze) * 100;
  return { feeGrosze, effectiveRatePercent };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hard-filter: gateways that cannot serve the request at all
// ─────────────────────────────────────────────────────────────────────────────

function meetsHardRequirements(
  cap: GatewayCapabilities,
  input: GatewayRecommendationInput,
): boolean {
  if (!cap.isActive) return false;

  // Currency support
  if (!(cap.supportedCurrencies as readonly SupportedCurrency[]).includes(input.currency)) {
    return false;
  }

  if (input.requiresBlik === true && !cap.supportsBlik) return false;
  if (input.requiresCards === true && !cap.supportsCards) return false;
  if (input.requiresBNPL === true && !cap.supportsBNPL) return false;
  if (input.requiresB2BBNPL === true && !cap.supportsB2BBNPL) return false;
  if (input.requiresMarketplaceSplit === true && !cap.supportsMarketplaceSplit) return false;

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build human-readable reason string
// ─────────────────────────────────────────────────────────────────────────────

function buildReason(
  cap: GatewayCapabilities,
  rank: number,
  input: GatewayRecommendationInput,
): string {
  if (rank === 1) {
    if (input.requiresB2BBNPL === true) {
      return "Only gateway supporting B2B BNPL via PragmaGO";
    }
    if (input.requiresBNPL === true) {
      return `Best gateway for B2C BNPL with ${(cap.commissionRate * 100).toFixed(2)}% commission`;
    }
    if (input.requiresMarketplaceSplit === true) {
      return "Only gateway supporting marketplace split payments";
    }
    if (input.currency !== "PLN") {
      return `Best multi-currency support including ${input.currency}`;
    }
    if (input.minimiseCommission === true || input.minimiseCommission === undefined) {
      return `Lowest commission in Poland: ${(cap.commissionRate * 100).toFixed(2)}% with no fixed fee`;
    }
    return `Top reliability score (${cap.reliabilityScore}/100)`;
  }

  const feeInfo = `${(cap.commissionRate * 100).toFixed(2)}%${cap.fixedFeeGrosze > 0 ? ` + ${(cap.fixedFeeGrosze / 100).toFixed(2)} PLN` : ""}`;
  return `Alternative option — commission ${feeInfo}, reliability ${cap.reliabilityScore}/100`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main recommender
// ─────────────────────────────────────────────────────────────────────────────

export function recommendGateways(
  input: GatewayRecommendationInput,
): GatewayRecommendation[] {
  const eligible = (Object.values(GATEWAY_CAPABILITIES) as GatewayCapabilities[])
    .filter((cap) => meetsHardRequirements(cap, input));

  if (eligible.length === 0) {
    return [];
  }

  // Sort priority:
  // 1. If minimiseCommission (or unset) → sort by total fee ascending, then reliability desc
  // 2. If reliability matters more → sort by reliabilityScore desc, then fee asc
  const minimise = input.minimiseCommission !== false;

  const sorted = [...eligible].sort((a, b) => {
    const feeA = computeFee(a, input.amountGrosze).feeGrosze;
    const feeB = computeFee(b, input.amountGrosze).feeGrosze;

    if (minimise) {
      if (feeA !== feeB) return feeA - feeB;
      return b.reliabilityScore - a.reliabilityScore;
    } else {
      if (a.reliabilityScore !== b.reliabilityScore) {
        return b.reliabilityScore - a.reliabilityScore;
      }
      return feeA - feeB;
    }
  });

  return sorted.map((cap, index) => {
    const rank = index + 1;
    const { feeGrosze, effectiveRatePercent } = computeFee(cap, input.amountGrosze);
    return {
      rank,
      gatewayCode: cap.code,
      reason: buildReason(cap, rank, input),
      estimatedFeeGrosze: feeGrosze,
      effectiveRatePercent: Math.round(effectiveRatePercent * 10000) / 10000,
      capabilities: cap,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: get single best recommendation
// ─────────────────────────────────────────────────────────────────────────────

export function recommendBestGateway(
  input: GatewayRecommendationInput,
): GatewayRecommendation | null {
  const recommendations = recommendGateways(input);
  return recommendations[0] ?? null;
}
