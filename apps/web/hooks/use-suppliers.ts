'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { ApiClientError } from '@/lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SupplierType = 'china' | 'poland' | 'turkey' | 'eu' | 'dropship';

export interface SupplierContacts {
  telegram?: string;
  email?: string;
  whatsapp?: string;
  phone?: string;
}

export interface SupplierShippingInfo {
  methods?: string[];
  regionsServed?: string[];
  averageDaysToPoland?: number;
  freeShippingAboveEur?: number;
  notes?: string;
}

/** Shape returned by GET /api/suppliers (Elasticsearch flat document) */
export interface SupplierListItem {
  id: string;
  name: string;
  slug: string;
  type: SupplierType;
  country: string | null;
  website: string | null;
  logoUrl: string | null;
  /** Flat multilingual description fields from Elasticsearch */
  descriptionRu: string | null;
  descriptionPl: string | null;
  descriptionUa: string | null;
  descriptionEn: string | null;
  minimumOrderEur: number | null;
  categories: string[];
  platforms: string[];
  supportsDropship: boolean;
  hasBaselinkerId: string | null;
  isVerified: boolean;
  /** Rating as number from Elasticsearch */
  rating: number;
  reviewCount: number;
  languages: string[];
  tags: string[];
  isActive: boolean;
  isFeatured: boolean;
  partnerCommissionPct: number | null;
  createdAt: string;
}

export interface SupplierReview {
  id: string;
  supplierId: string;
  userId: string;
  rating: number;
  comment: string | null;
  language: string | null;
  pros: string[];
  cons: string[];
  createdAt: string;
}

/** Shape returned by GET /api/suppliers/:id (PostgreSQL full record) */
export interface SupplierDetail {
  id: string;
  name: string;
  slug: string;
  type: SupplierType;
  country: string | null;
  website: string | null;
  logoUrl: string | null;
  /** Nested multilingual description from PostgreSQL */
  description: { ru?: string; pl?: string; ua?: string; en?: string } | null;
  minimumOrderEur: number | null;
  categories: string[];
  platforms: string[];
  supportsDropship: boolean;
  hasBaselinkerId: string | null;
  isVerified: boolean;
  /** Rating as string (numeric) from PostgreSQL */
  rating: string;
  reviewCount: number;
  languages: string[];
  contacts: SupplierContacts | null;
  shippingInfo: SupplierShippingInfo | null;
  partnerCommissionPct: string | null;
  tags: string[];
  isActive: boolean;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
  recentReviews?: SupplierReview[];
}

export interface SupplierFilters {
  type?: SupplierType | '';
  category?: string;
  country?: string;
  dropship?: boolean;
  minRating?: number;
  page?: number;
  limit?: number;
}

export interface SuppliersListResponse {
  items: SupplierListItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build headers for the /api/suppliers proxy.
 * The proxy generates the HS256 Bearer token server-side; we just pass user context.
 */
function buildProxyHeaders(
  userId: string | undefined,
  plan: string | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (userId) headers['x-proxy-user-id'] = userId;
  if (plan) headers['x-proxy-user-plan'] = plan;
  return headers;
}

async function parseListEnvelope(
  response: Response,
): Promise<SuppliersListResponse> {
  if (!response.ok) {
    const json = await response.json().catch(() => ({})) as Record<string, unknown>;
    const errMsg =
      (json['error'] as { message?: string } | undefined)?.message ??
      `HTTP ${response.status}`;
    throw new ApiClientError(response.status, errMsg);
  }

  const json = await response.json() as Record<string, unknown>;

  if (json['success'] === false) {
    const errMsg =
      (json['error'] as { message?: string } | undefined)?.message ??
      'Request failed';
    throw new ApiClientError(400, errMsg);
  }

  const data = json['data'];
  const meta = (json['meta'] ?? {}) as {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };

  if (Array.isArray(data)) {
    return {
      items: data as SupplierListItem[],
      total: meta.total ?? (data as unknown[]).length,
      page: meta.page ?? 1,
      limit: meta.limit ?? 20,
      hasMore: meta.hasMore ?? false,
    };
  }

  return { items: [], total: 0, page: 1, limit: 20, hasMore: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// useSuppliers — paginated list with filters
// ─────────────────────────────────────────────────────────────────────────────

export function useSuppliers(filters: SupplierFilters = {}) {
  const { user } = useAuthStore();

  return useQuery<SuppliersListResponse, ApiClientError>({
    queryKey: ['suppliers', filters],
    queryFn: async () => {
      const params = new URLSearchParams();

      if (filters.type) params.set('type', filters.type);
      if (filters.category) params.set('category', filters.category);
      if (filters.country) params.set('country', filters.country);
      if (filters.dropship !== undefined)
        params.set('dropship', String(filters.dropship));
      if (filters.minRating !== undefined && filters.minRating > 0)
        params.set('minRating', String(filters.minRating));
      if (filters.page && filters.page > 1)
        params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));

      const qs = params.toString();
      const response = await fetch(`/api/suppliers${qs ? '?' + qs : ''}`, {
        headers: buildProxyHeaders(user?.id, user?.plan),
      });

      return parseListEnvelope(response);
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useSupplierSearch — Elasticsearch full-text search
// ─────────────────────────────────────────────────────────────────────────────

export function useSupplierSearch(
  query: string,
  filters: Omit<SupplierFilters, 'page' | 'limit' | 'country'> = {},
) {
  const { user } = useAuthStore();

  return useQuery<SuppliersListResponse, ApiClientError>({
    queryKey: ['supplier-search', query, filters],
    queryFn: async () => {
      const params = new URLSearchParams({ q: query });

      if (filters.type) params.set('type', filters.type);
      if (filters.category) params.set('category', filters.category);
      if (filters.dropship !== undefined)
        params.set('dropship', String(filters.dropship));
      if (filters.minRating !== undefined && filters.minRating > 0)
        params.set('minRating', String(filters.minRating));

      const response = await fetch(`/api/suppliers/search?${params.toString()}`, {
        headers: buildProxyHeaders(user?.id, user?.plan),
      });

      return parseListEnvelope(response);
    },
    enabled: query.trim().length >= 2,
    staleTime: 60 * 1000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useSupplierCategories — unique category list from backend
// ─────────────────────────────────────────────────────────────────────────────

export function useSupplierCategories() {
  const { user } = useAuthStore();

  return useQuery<string[], ApiClientError>({
    queryKey: ['supplier-categories'],
    queryFn: async () => {
      const response = await fetch('/api/suppliers/categories', {
        headers: buildProxyHeaders(user?.id, user?.plan),
      });

      if (!response.ok) return [];

      const json = await response.json() as Record<string, unknown>;
      if (json['success'] === false) return [];

      const data = json['data'];
      if (Array.isArray(data)) return data as string[];
      return [];
    },
    staleTime: 30 * 60 * 1000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useSupplierDetail — full supplier record with reviews (from PostgreSQL)
// ─────────────────────────────────────────────────────────────────────────────

export function useSupplierDetail(id: string | null) {
  const { user } = useAuthStore();

  return useQuery<SupplierDetail, ApiClientError>({
    queryKey: ['supplier-detail', id],
    queryFn: async () => {
      const response = await fetch(`/api/suppliers/${id}`, {
        headers: buildProxyHeaders(user?.id, user?.plan),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({})) as Record<string, unknown>;
        const errMsg =
          (json['error'] as { message?: string } | undefined)?.message ??
          `HTTP ${response.status}`;
        throw new ApiClientError(response.status, errMsg);
      }

      const json = await response.json() as Record<string, unknown>;

      if (json['success'] === false) {
        const errMsg =
          (json['error'] as { message?: string } | undefined)?.message ??
          'Request failed';
        throw new ApiClientError(400, errMsg);
      }

      return json['data'] as SupplierDetail;
    },
    enabled: id !== null,
    staleTime: 5 * 60 * 1000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useSupplierFeatured — featured/partner suppliers
// ─────────────────────────────────────────────────────────────────────────────

export function useSupplierFeatured() {
  const { user } = useAuthStore();

  return useQuery<SuppliersListResponse, ApiClientError>({
    queryKey: ['supplier-featured'],
    queryFn: async () => {
      const response = await fetch('/api/suppliers/featured', {
        headers: buildProxyHeaders(user?.id, user?.plan),
      });

      if (!response.ok) {
        return { items: [], total: 0, page: 1, limit: 20, hasMore: false };
      }

      return parseListEnvelope(response).catch(() => ({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        hasMore: false,
      }));
    },
    staleTime: 10 * 60 * 1000,
  });
}
