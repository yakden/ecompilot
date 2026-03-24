'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { ApiClientError } from '@/lib/api';

// ─── Shared types ─────────────────────────────────────────────────────────────

export type AbcClass = 'A' | 'B' | 'C';

export type AlertType = 'low_stock' | 'out_of_stock' | 'overstock' | 'dead_stock';

export interface Product {
  id: string;
  userId: string;
  sku: string;
  name: string;
  category: string;
  purchasePrice: number;
  sellingPrice: number;
  currentStock: number;
  reservedStock: number;
  reorderPoint: number;
  leadTimeDays: number;
  lastSoldAt: string | null;
  totalSold: number;
  totalRevenue: number;
  abcClass: AbcClass | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventorySnapshot {
  id: string;
  productId: string;
  stock: number;
  date: string;
  soldCount: number;
  revenue: number;
  createdAt: string;
}

export interface ReorderAlert {
  id: string;
  productId: string;
  alertType: AlertType;
  currentStock: number;
  reorderPoint: number;
  isAcknowledged: boolean;
  createdAt: string;
}

export interface AlertWithProduct {
  alert: ReorderAlert;
  product: {
    id: string;
    sku: string;
    name: string;
    category: string;
    userId: string;
  };
}

export interface AbcStats {
  totalProducts: number;
  totalRevenue: number;
  aProductsPct: number;
  bProductsPct: number;
  cProductsPct: number;
  aRevenuePct: number;
  bRevenuePct: number;
  cRevenuePct: number;
}

export interface AbcAnalysisResult {
  classA: Product[];
  classB: Product[];
  classC: Product[];
  stats: AbcStats;
}

export type DeadStockAction = 'discount_sell' | 'bundle' | 'liquidate' | 'return_to_supplier';

export interface ProductRecommendation {
  productId: string;
  sku: string;
  productName: string;
  category: string;
  currentStock: number;
  purchasePrice: number;
  monthlyHoldingCost: number;
  daysSinceLastSale: number | null;
  action: DeadStockAction;
  actionReason: string;
}

export interface DeadStockResult {
  deadStock: Product[];
  slowMoving: Product[];
  totalHoldingCost: number;
  recommendations: ProductRecommendation[];
}

export interface ForecastResult {
  productId: string;
  productName: string;
  currentStock: number;
  dailyRate: number;
  weeklyForecast: number;
  monthlyForecast: number;
  daysUntilStockout: number | null;
  recommendedReorderDate: string | null;
  seasonalFactor: number;
  soldLast90Days: number;
}

export interface ProductsListResponse {
  data: Product[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

export interface ProductDetailResponse {
  product: Product;
  snapshots: InventorySnapshot[];
}

export interface CreateProductPayload {
  sku: string;
  name: string;
  category: string;
  purchasePrice: number;
  sellingPrice: number;
  currentStock?: number;
  reservedStock?: number;
  reorderPoint?: number;
  leadTimeDays?: number;
}

export interface UpdateProductPayload {
  name?: string;
  category?: string;
  purchasePrice?: number;
  sellingPrice?: number;
  currentStock?: number;
  reservedStock?: number;
  reorderPoint?: number;
  leadTimeDays?: number;
}

export interface ProductsQueryParams {
  limit?: number;
  offset?: number;
  sortBy?: 'revenue' | 'stock' | 'lastSold' | 'name' | 'created';
  sortDir?: 'asc' | 'desc';
  category?: string;
  abcClass?: AbcClass;
}

// ─── Query key factory ───────────────────────────────────────────────────────

export const inventoryKeys = {
  all: ['inventory'] as const,
  products: (params?: ProductsQueryParams) =>
    [...inventoryKeys.all, 'products', params] as const,
  product: (id: string) => [...inventoryKeys.all, 'product', id] as const,
  abc: () => [...inventoryKeys.all, 'abc-analysis'] as const,
  deadstock: () => [...inventoryKeys.all, 'deadstock'] as const,
  alerts: () => [...inventoryKeys.all, 'reorder-alerts'] as const,
  forecast: (productId: string) =>
    [...inventoryKeys.all, 'forecast', productId] as const,
};

// ─── Auth headers helper ──────────────────────────────────────────────────────

function buildAuthHeaders(
  userId: string | undefined,
  plan: string | undefined,
  accessToken: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    'x-internal-service': 'true',
  };
  if (userId) headers['x-user-id'] = userId;
  if (plan) headers['x-user-plan'] = plan;
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const json = await response
      .json()
      .catch(() => ({})) as { error?: { message?: string }; message?: string };
    const errMsg = json.error?.message ?? json.message ?? `HTTP ${response.status}`;
    throw new ApiClientError(response.status, errMsg);
  }
  const json = await response.json();
  // If response has both data + pagination (paginated list), return whole object
  if (json.data !== undefined && json.pagination !== undefined) {
    return json as T;
  }
  // If response has success wrapper {success, data}, unwrap
  if (json.success !== undefined && json.data !== undefined) {
    return json.data as T;
  }
  // Otherwise return as-is
  return (json.data ?? json) as T;
}

const BASE = '/api/v1/inventory';

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useProducts(params: ProductsQueryParams = {}) {
  const { user, accessToken } = useAuthStore();

  return useQuery<ProductsListResponse, ApiClientError>({
    queryKey: inventoryKeys.products(params),
    queryFn: async () => {
      const headers = buildAuthHeaders(user?.id, user?.plan, accessToken);
      const qs = new URLSearchParams();
      if (params.limit !== undefined) qs.set('limit', String(params.limit));
      if (params.offset !== undefined) qs.set('offset', String(params.offset));
      if (params.sortBy !== undefined) qs.set('sortBy', params.sortBy);
      if (params.sortDir !== undefined) qs.set('sortDir', params.sortDir);
      if (params.category !== undefined) qs.set('category', params.category);
      if (params.abcClass !== undefined) qs.set('abcClass', params.abcClass);

      const response = await fetch(
        `${BASE}/products?${qs.toString()}`,
        { headers },
      );
      return handleResponse<ProductsListResponse>(response);
    },
    staleTime: 30_000,
  });
}

export function useProduct(id: string) {
  const { user, accessToken } = useAuthStore();

  return useQuery<ProductDetailResponse, ApiClientError>({
    queryKey: inventoryKeys.product(id),
    queryFn: async () => {
      const headers = buildAuthHeaders(user?.id, user?.plan, accessToken);
      const response = await fetch(`${BASE}/products/${id}`, { headers });
      return handleResponse<ProductDetailResponse>(response);
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateProduct() {
  const { user, accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation<Product, ApiClientError, CreateProductPayload>({
    mutationFn: async (payload) => {
      const headers = {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(user?.id, user?.plan, accessToken),
      };
      const response = await fetch(`${BASE}/products`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      return handleResponse<Product>(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useUpdateProduct(id: string) {
  const { user, accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation<Product, ApiClientError, UpdateProductPayload>({
    mutationFn: async (payload) => {
      const headers = {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(user?.id, user?.plan, accessToken),
      };
      const response = await fetch(`${BASE}/products/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      });
      return handleResponse<Product>(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export interface AbcAnalysisResponse {
  data: AbcAnalysisResult;
}

export interface DeadStockResponse {
  data: DeadStockResult;
}

export interface ReorderAlertsResponse {
  data: AlertWithProduct[];
}

export function useAbcAnalysis() {
  const { user, accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  // Exposed as a mutation so the user explicitly triggers it
  return useMutation<AbcAnalysisResponse, ApiClientError, void>({
    mutationFn: async () => {
      const headers = buildAuthHeaders(user?.id, user?.plan, accessToken);
      const response = await fetch(`${BASE}/abc-analysis`, { headers });
      const result = await handleResponse<AbcAnalysisResult>(response);
      return { data: result };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.products() });
    },
  });
}

export function useAbcAnalysisQuery() {
  const { user, accessToken } = useAuthStore();

  return useQuery<AbcAnalysisResponse, ApiClientError>({
    queryKey: inventoryKeys.abc(),
    queryFn: async () => {
      const headers = buildAuthHeaders(user?.id, user?.plan, accessToken);
      const response = await fetch(`${BASE}/abc-analysis`, { headers });
      const result = await handleResponse<AbcAnalysisResult>(response);
      return { data: result };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useDeadStock() {
  const { user, accessToken } = useAuthStore();

  return useQuery<DeadStockResponse, ApiClientError>({
    queryKey: inventoryKeys.deadstock(),
    queryFn: async () => {
      const headers = buildAuthHeaders(user?.id, user?.plan, accessToken);
      const response = await fetch(`${BASE}/deadstock`, { headers });
      const result = await handleResponse<DeadStockResult>(response);
      return { data: result };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useReorderAlerts() {
  const { user, accessToken } = useAuthStore();

  return useQuery<ReorderAlertsResponse, ApiClientError>({
    queryKey: inventoryKeys.alerts(),
    queryFn: async () => {
      const headers = buildAuthHeaders(user?.id, user?.plan, accessToken);
      const response = await fetch(`${BASE}/reorder-alerts`, { headers });
      const result = await handleResponse<AlertWithProduct[]>(response);
      return { data: result };
    },
    staleTime: 60_000,
  });
}

export function useForecast() {
  const { user, accessToken } = useAuthStore();

  return useMutation<
    ForecastResult,
    ApiClientError,
    { productId: string }
  >({
    mutationFn: async ({ productId }) => {
      const headers = {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(user?.id, user?.plan, accessToken),
      };
      const response = await fetch(`${BASE}/forecast`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ productId }),
      });
      return handleResponse<ForecastResult>(response);
    },
  });
}

export function useAcknowledgeAlert() {
  const { user, accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation<
    { id: string; acknowledged: boolean },
    ApiClientError,
    { alertId: string }
  >({
    mutationFn: async ({ alertId }) => {
      const headers = buildAuthHeaders(user?.id, user?.plan, accessToken);
      const response = await fetch(
        `${BASE}/acknowledge-alert/${alertId}`,
        { method: 'POST', headers },
      );
      return handleResponse<{ id: string; acknowledged: boolean }>(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.alerts() });
    },
  });
}
