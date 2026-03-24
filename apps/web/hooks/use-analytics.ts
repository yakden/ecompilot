'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { ApiClientError } from '@/lib/api';

interface AnalyzeNichePayload {
  keyword: string;
}

interface AnalyzeNicheResponse {
  jobId: string;
}

// Shape returned by the frontend-facing API (NicheAnalyzer component expectation)
export interface NicheResult {
  niche: string;
  score: number;
  competition: number;
  demand: number;
  profitability: number;
  trend: 'up' | 'down' | 'stable';
  avgPrice: number;
  monthlyVolume: number;
  topProducts: Array<{
    name: string;
    price: number;
    sales: number;
    rating: number;
  }>;
  dataSource?: 'allegro_scrape' | 'estimated';
}

// Raw shape stored in the result field by the backend analytics-service
interface RawNicheAnalysisResult {
  keyword?: string;
  niche?: string;
  score?: number;
  demand?: number;
  competition?: number;
  margin?: number;
  profitability?: number;
  trend?: number | string;
  entryBarrier?: number;
  listings?: Array<{
    title?: string;
    price?: number;
    sellerName?: string;
    sellerRating?: number;
    reviewCount?: number;
  }>;
  topSellers?: Array<{
    sellerName?: string;
    listingsCount?: number;
    avgRating?: number;
    sharePercent?: number;
  }>;
  priceAnalysis?: { avg?: number; min?: number; max?: number; median?: number };
  trendData?: unknown[];
  seasonality?: unknown[];
  recommendation?: string;
  dataSource?: 'allegro_scrape' | 'estimated';
  analyzedAt?: string;
  // legacy frontend fields that may already be present
  avgPrice?: number;
  monthlyVolume?: number;
}

interface RawNicheStatusResponse {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: RawNicheAnalysisResult;
  error?: string;
}

export interface NicheStatusResponse {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: NicheResult;
  error?: string;
}

interface TrendingResponse {
  items: Array<{
    keyword: string;
    score: number;
    change: number;
    category: string;
  }>;
}

interface SeasonalResponse {
  items: Array<{
    keyword: string;
    months: number[];
    peakMonth: number;
    category: string;
  }>;
}

function buildAuthHeaders(userId: string | undefined, plan: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (userId) headers['x-user-id'] = userId;
  if (plan) headers['x-user-plan'] = plan;
  return headers;
}

export function useAnalyzeNiche() {
  const { user, accessToken } = useAuthStore();

  return useMutation<AnalyzeNicheResponse, ApiClientError, AnalyzeNichePayload>({
    mutationFn: async (payload) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(user?.id, user?.plan),
      };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch('/api/v1/analytics/niches/analyze', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        const errMsg = json.error?.message ?? json.message ?? `HTTP ${response.status}`;
        throw new ApiClientError(response.status, errMsg);
      }

      const json = await response.json();
      return (json.data ?? json) as AnalyzeNicheResponse;
    },
  });
}

function transformRawResult(
  rawResult: RawNicheAnalysisResult,
  keyword: string,
): NicheResult {
  const recommendation = rawResult.recommendation ?? '';

  let trend: 'up' | 'down' | 'stable';
  if (recommendation === 'highly_recommended' || recommendation === 'recommended') {
    trend = 'up';
  } else if (recommendation === 'caution' || recommendation === 'not_recommended') {
    trend = 'down';
  } else {
    trend = 'stable';
  }

  const sellers = rawResult.topSellers ?? [];
  const listings = rawResult.listings ?? [];
  const sourceItems = sellers.length > 0 ? sellers : listings;

  const topProducts = sourceItems.slice(0, 5).map((item) => {
    const asSeller = item as typeof sellers[number];
    const asListing = item as typeof listings[number];
    return {
      name: asSeller.sellerName ?? asListing.title ?? 'Unknown',
      price: asListing.price ?? rawResult.priceAnalysis?.avg ?? 0,
      sales: asSeller.listingsCount ?? 0,
      rating: asSeller.avgRating ?? asListing.sellerRating ?? 0,
    };
  });

  return {
    niche: rawResult.keyword ?? rawResult.niche ?? keyword,
    score: rawResult.score ?? 0,
    competition: rawResult.competition ?? 0,
    demand: rawResult.demand ?? 0,
    profitability: rawResult.margin ?? rawResult.profitability ?? 0,
    trend,
    avgPrice: rawResult.priceAnalysis?.avg ?? rawResult.avgPrice ?? 0,
    monthlyVolume: listings.length > 0 ? listings.length * 30 : (rawResult.monthlyVolume ?? 0),
    topProducts,
    dataSource: rawResult.dataSource,
  };
}

export function useNicheStatus(jobId: string | null, keyword?: string) {
  const { user, accessToken } = useAuthStore();

  return useQuery<NicheStatusResponse, ApiClientError>({
    queryKey: ['niche-status', jobId],
    queryFn: async () => {
      const headers: Record<string, string> = {
        ...buildAuthHeaders(user?.id, user?.plan),
      };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(`/api/v1/analytics/niches/status/${jobId}`, { headers });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        const errMsg = json.error?.message ?? json.message ?? `HTTP ${response.status}`;
        throw new ApiClientError(response.status, errMsg);
      }

      const json = await response.json();
      const statusData = (json.data ?? json) as RawNicheStatusResponse;

      if (statusData.result !== undefined && statusData.result !== null) {
        const transformed = transformRawResult(statusData.result, keyword ?? '');
        return { ...statusData, result: transformed };
      }

      return statusData as unknown as NicheStatusResponse;
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      return data.status === 'completed' || data.status === 'failed' ? false : 2000;
    },
  });
}

export function useTrending() {
  const { user, accessToken } = useAuthStore();

  return useQuery<TrendingResponse, ApiClientError>({
    queryKey: ['analytics-trending'],
    queryFn: async () => {
      const headers: Record<string, string> = {
        ...buildAuthHeaders(user?.id, user?.plan),
      };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch('/api/v1/analytics/trending', { headers });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        const errMsg = json.error?.message ?? json.message ?? `HTTP ${response.status}`;
        throw new ApiClientError(response.status, errMsg);
      }

      const json = await response.json();
      return (json.data ?? json) as TrendingResponse;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSeasonal() {
  const { user, accessToken } = useAuthStore();

  return useQuery<SeasonalResponse, ApiClientError>({
    queryKey: ['analytics-seasonal'],
    queryFn: async () => {
      const headers: Record<string, string> = {
        ...buildAuthHeaders(user?.id, user?.plan),
      };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch('/api/v1/analytics/seasonal', { headers });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        const errMsg = json.error?.message ?? json.message ?? `HTTP ${response.status}`;
        throw new ApiClientError(response.status, errMsg);
      }

      const json = await response.json();
      return (json.data ?? json) as SeasonalResponse;
    },
    staleTime: 60 * 60 * 1000,
  });
}
