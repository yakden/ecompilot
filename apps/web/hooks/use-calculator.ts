'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { ApiClientError } from '@/lib/api';

export interface MarginCalcPayload {
  productCost: number;
  shippingCost: number;
  platformFeePercent: number;
  sellingPrice: number;
  platform: string;
}

export interface MarginCalcResult {
  grossProfit: number;
  netProfit: number;
  margin: number;
  roi: number;
  breakeven: number;
  recommendation?: string;
  costBreakdown: {
    productCost: number;
    shippingCost: number;
    platformFeeAmount: number;
    totalCosts: number;
  };
}

export interface ZusCalcPayload {
  incomeType: 'b2b' | 'employment' | 'self_employed';
  grossIncome: number;
  year: number;
}

export interface ZusCalcResult {
  social: number;
  health: number;
  laborFund: number;
  total: number;
  netIncome: number;
  effectiveRate: number;
}

export interface DeliveryCalcPayload {
  weightKg: number;
  volumeCm3?: number;
  originCity: string;
  destinationCountry: string;
  goods: string;
  quantity: number;
}

export interface DeliveryCalcResult {
  sea: { days: number; costUsd: number; costPln: number } | null;
  air: { days: number; costUsd: number; costPln: number } | null;
  express: { days: number; costUsd: number; costPln: number } | null;
  customsDuty: number;
  vatAmount: number;
  totalLandedCost: number;
}

export interface AllegroFeesPayload {
  category: string;
  sellingPrice: number;
  isPromoted: boolean;
  hasSuperSeller: boolean;
}

export interface AllegroFeesResult {
  listingFee: number;
  successFee: number;
  promotionFee: number;
  totalFee: number;
  feePercent: number;
  netRevenue: number;
}

export interface ExchangeRates {
  USD: number;
  EUR: number;
  CNY: number;
  GBP: number;
  updatedAt: string;
}

function buildAuthHeaders(userId: string | undefined, token: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (userId) headers['x-user-id'] = userId;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export function useMarginCalc() {
  const { user, accessToken } = useAuthStore();

  return useMutation<MarginCalcResult, ApiClientError, MarginCalcPayload>({
    mutationFn: async (payload) => {
      const response = await fetch('/api/v1/calc/margin', {
        method: 'POST',
        headers: buildAuthHeaders(user?.id, accessToken),
        body: JSON.stringify({
          purchasePricePln: payload.productCost,
          shippingFromChina: payload.shippingCost,
          customsDutyPct: 4,
          vatRatePct: 23,
          allegroCommissionPct: payload.platformFeePercent,
          allegroAdsCost: 0,
          returnRatePct: 2,
          sellingPricePln: payload.sellingPrice,
          quantity: 100,
        }),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        const errMsg = json.error?.message ?? json.message ?? `HTTP ${response.status}`;
        throw new ApiClientError(response.status, errMsg);
      }

      const json = await response.json();
      const raw = (json.data ?? json) as Record<string, unknown>;
      return {
        grossProfit: parseFloat(String(raw.grossProfit ?? raw.netRevenue ?? 0)),
        netProfit: parseFloat(String(raw.netProfit ?? 0)),
        margin: parseFloat(String(raw.marginPct ?? raw.margin ?? 0)),
        roi: parseFloat(String(raw.roi ?? 0)),
        breakeven: parseInt(String(raw.breakeven ?? 0), 10),
        recommendation: String(raw.recommendation ?? ''),
        costBreakdown: {
          productCost: parseFloat(String((raw.breakdown as Record<string, string>)?.purchase ?? payload.productCost)),
          shippingCost: parseFloat(String((raw.breakdown as Record<string, string>)?.shipping ?? payload.shippingCost)),
          platformFeeAmount: parseFloat(String((raw.breakdown as Record<string, string>)?.commission ?? 0)),
          totalCosts: parseFloat(String(raw.totalCostPerUnit ?? 0)),
        },
      } as MarginCalcResult;
    },
  });
}

export function useZusCalc() {
  const { user, accessToken } = useAuthStore();

  return useMutation<ZusCalcResult, ApiClientError, ZusCalcPayload>({
    mutationFn: async (payload) => {
      // Map frontend field names to backend expected format
      const zusTypeMap: Record<string, string> = {
        self_employed: 'full',
        b2b: 'full',
        employment: 'reduced',
      };
      const backendPayload = {
        monthlyIncome: payload.grossIncome,
        zusType: zusTypeMap[payload.incomeType] ?? 'full',
        includeChorobowe: true,
      };

      const response = await fetch('/api/v1/calc/zus', {
        method: 'POST',
        headers: buildAuthHeaders(user?.id, accessToken),
        body: JSON.stringify(backendPayload),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        const errMsg = json.error?.message ?? json.message ?? `HTTP ${response.status}`;
        throw new ApiClientError(response.status, errMsg);
      }

      const json = await response.json();
      const raw = (json.data ?? json) as Record<string, unknown>;
      return {
        social: parseFloat(String(raw.socialTotal ?? 0)),
        health: parseFloat(String(raw.healthContribution ?? 0)),
        laborFund: parseFloat(String((raw.breakdown as Record<string, string>)?.fp ?? 0)),
        total: parseFloat(String(raw.totalZus ?? 0)),
        netIncome: parseFloat(String(raw.netIncome ?? 0)),
        effectiveRate: parseFloat(String(raw.effectiveTaxRate ?? 0)),
      } as ZusCalcResult;
    },
  });
}

export function useDeliveryCalc() {
  const { user, accessToken } = useAuthStore();

  return useMutation<DeliveryCalcResult, ApiClientError, DeliveryCalcPayload>({
    mutationFn: async (payload) => {
      // Map frontend fields to backend format
      const backendPayload = {
        weightKg: payload.weightKg,
        volumeM3: (payload.volumeCm3 ?? 0) / 1000000 || 0.01,
        method: 'sea' as const,
        isWhiteImport: true,
      };

      const response = await fetch('/api/v1/calc/delivery-china', {
        method: 'POST',
        headers: buildAuthHeaders(user?.id, accessToken),
        body: JSON.stringify(backendPayload),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        const errMsg = json.error?.message ?? json.message ?? `HTTP ${response.status}`;
        throw new ApiClientError(response.status, errMsg);
      }

      const json = await response.json();
      const raw = (json.data ?? json) as Record<string, unknown>;
      return {
        sea: { costUsd: parseFloat(String(raw.shippingCost ?? 0)) / 4.2, costPln: parseFloat(String(raw.shippingCost ?? 0)), days: Number(raw.estimatedDays ?? 45) },
        air: null,
        express: null,
        customsDuty: parseFloat(String(raw.customsDuty ?? 0)),
        vatAmount: parseFloat(String(raw.vatOnImport ?? 0)),
        totalLandedCost: parseFloat(String(raw.totalLandedCost ?? 0)),
      } as DeliveryCalcResult;
    },
  });
}

export function useAllegroFees() {
  const { user, accessToken } = useAuthStore();

  return useMutation<AllegroFeesResult, ApiClientError, AllegroFeesPayload>({
    mutationFn: async (payload) => {
      // Map frontend fields to backend format
      const backendPayload = {
        category: payload.category,
        sellingPricePln: payload.sellingPrice,
        isSmartSeller: payload.hasSuperSeller,
      };

      const response = await fetch('/api/v1/calc/allegro-fees', {
        method: 'POST',
        headers: buildAuthHeaders(user?.id, accessToken),
        body: JSON.stringify(backendPayload),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        const errMsg = json.error?.message ?? json.message ?? `HTTP ${response.status}`;
        throw new ApiClientError(response.status, errMsg);
      }

      const json = await response.json();
      const raw = (json.data ?? json) as Record<string, unknown>;
      return {
        listingFee: 0,
        successFee: parseFloat(String(raw.commissionPln ?? 0)),
        promotionFee: 0,
        totalFee: parseFloat(String(raw.commissionPln ?? 0)),
        feePercent: parseFloat(String(raw.commissionPct ?? 0)),
        netRevenue: parseFloat(String(raw.netAfterCommission ?? 0)),
        smartDiscount: parseFloat(String(raw.smartDiscount ?? 0)),
      } as AllegroFeesResult;
    },
  });
}

export function useRates() {
  const { user, accessToken } = useAuthStore();

  return useQuery<ExchangeRates, ApiClientError>({
    queryKey: ['exchange-rates'],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (user?.id) headers['x-user-id'] = user.id;
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch('/api/v1/calc/rates', { headers });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        const errMsg = json.error?.message ?? json.message ?? `HTTP ${response.status}`;
        throw new ApiClientError(response.status, errMsg);
      }

      const json = await response.json();
      return (json.data ?? json) as ExchangeRates;
    },
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });
}
