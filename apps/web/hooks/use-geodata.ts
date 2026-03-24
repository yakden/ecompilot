'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { ApiClientError } from '@/lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
  city?: string;
  country?: string;
  countryCode?: string;
  postalCode?: string;
  street?: string;
}

export interface CountryInfo {
  name: {
    common: string;
    official: string;
    native?: Record<string, { common: string; official: string }>;
  };
  cca2: string;
  cca3?: string;
  capital?: string[];
  region?: string;
  subregion?: string;
  population?: number;
  flags?: {
    png?: string;
    svg?: string;
    emoji?: string;
  };
  currencies?: Record<string, { name: string; symbol: string }>;
  languages?: Record<string, string>;
  timezones?: string[];
  vatRate?: number;
  callingCode?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth headers helper
// ─────────────────────────────────────────────────────────────────────────────

function buildHeaders(userId: string | undefined, token: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (userId) headers['x-user-id'] = userId;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: `HTTP ${response.status}` })) as { error?: { message?: string }; message?: string };
    throw new ApiClientError(response.status, body.error?.message ?? body.message ?? `HTTP ${response.status}`);
  }
  const json = await response.json();
  // Unwrap common response envelopes
  if (json.data !== undefined && json.pagination !== undefined) return json as T;
  if (json.data !== undefined) return json.data as T;
  if (json.results !== undefined) return json.results as T;
  if (json.countries !== undefined) return json.countries as T;
  return json as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useGeocode(address: string) {
  const { user, accessToken } = useAuthStore();

  return useQuery<GeocodeResult[], ApiClientError>({
    queryKey: ['geocode', address],
    queryFn: async () => {
      const params = new URLSearchParams({ address: address.trim() });
      const response = await fetch(`/api/v1/calc/geocode?${params.toString()}`, {
        headers: buildHeaders(user?.id, accessToken),
      });
      return handleResponse<GeocodeResult[]>(response);
    },
    enabled: address.trim().length >= 3,
    staleTime: 2 * 60 * 1000,
    retry: false,
  });
}

export function useCountry(code: string) {
  const { user, accessToken } = useAuthStore();

  return useQuery<CountryInfo, ApiClientError>({
    queryKey: ['country', code],
    queryFn: async () => {
      const response = await fetch(`/api/v1/calc/country/${encodeURIComponent(code)}`, {
        headers: buildHeaders(user?.id, accessToken),
      });
      return handleResponse<CountryInfo>(response);
    },
    enabled: code.trim().length === 2,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
}

export function useCountries() {
  const { user, accessToken } = useAuthStore();

  return useQuery<CountryInfo[], ApiClientError>({
    queryKey: ['countries'],
    queryFn: async () => {
      const response = await fetch('/api/v1/calc/countries', {
        headers: buildHeaders(user?.id, accessToken),
      });
      return handleResponse<CountryInfo[]>(response);
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}
