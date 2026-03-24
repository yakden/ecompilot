'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { ApiClientError } from '@/lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ProductSource = 'icecat' | 'upcitemdb' | 'openfoodfacts' | 'combined';

export interface Nutriments {
  energyKcal?: number;
  fat?: number;
  saturatedFat?: number;
  carbohydrates?: number;
  sugars?: number;
  fiber?: number;
  proteins?: number;
  salt?: number;
}

export interface BarcodeLookupResult {
  barcode: string;
  name?: string;
  brand?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  source: ProductSource;
  nutriScore?: string;
  nutriments?: Nutriments;
  ingredients?: string;
  allergens?: string[];
  labels?: string[];
  weight?: string;
  country?: string;
}

export interface FoodProductResult {
  barcode: string;
  name?: string;
  brand?: string;
  categories?: string;
  imageUrl?: string;
  nutriScore?: string;
  nutriments?: Nutriments;
  ingredients?: string;
  allergens?: string[];
  labels?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth headers helper
// ─────────────────────────────────────────────────────────────────────────────

function buildHeaders(userId: string | undefined, token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'x-internal-service': 'true',
  };
  if (userId) headers['x-user-id'] = userId;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: `HTTP ${response.status}` })) as { message?: string; error?: { message?: string } };
    throw new ApiClientError(response.status, body.error?.message ?? body.message ?? `HTTP ${response.status}`);
  }
  const json = await response.json() as { success?: boolean; data?: T } | T;
  if (typeof json === 'object' && json !== null && 'data' in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

function isValidBarcode(barcode: string): boolean {
  const cleaned = barcode.replace(/\D/g, '');
  return cleaned.length >= 8 && cleaned.length <= 14;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useBarcodeLookup(barcode: string) {
  const { user, accessToken } = useAuthStore();

  return useQuery<BarcodeLookupResult, ApiClientError>({
    queryKey: ['barcode-lookup', barcode],
    queryFn: async () => {
      const response = await fetch(`/api/v1/content/lookup/${encodeURIComponent(barcode)}`, {
        headers: buildHeaders(user?.id, accessToken),
      });
      const raw = await handleResponse<{ found: boolean; product?: { title?: string; brand?: string; category?: string; description?: string; images?: string[]; source?: string; nutriScore?: string; nutriments?: Nutriments; allergens?: string[] } }>(response);

      if (!raw.found || !raw.product) {
        throw new ApiClientError(404, 'Product not found');
      }

      const p = raw.product;
      return {
        barcode,
        name: p.title,
        brand: p.brand,
        category: p.category || undefined,
        description: p.description,
        imageUrl: p.images?.[0],
        source: (p.source ?? 'combined') as ProductSource,
        nutriScore: p.nutriScore,
        nutriments: p.nutriments,
        allergens: p.allergens,
      } satisfies BarcodeLookupResult;
    },
    enabled: isValidBarcode(barcode),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

export function useFoodProduct(barcode: string) {
  const { user, accessToken } = useAuthStore();

  return useQuery<FoodProductResult, ApiClientError>({
    queryKey: ['food-product', barcode],
    queryFn: async () => {
      const response = await fetch(`/api/v1/content/food-product/${encodeURIComponent(barcode)}`, {
        headers: buildHeaders(user?.id, accessToken),
      });
      return handleResponse<FoodProductResult>(response);
    },
    enabled: isValidBarcode(barcode),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}
