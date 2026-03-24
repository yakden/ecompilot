'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { ApiClientError } from '@/lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PaczkomatType = 'locker' | 'pop' | 'parcel_locker' | 'parcel_locker_superpop';

export interface PaczkomatPoint {
  name: string;
  address: {
    line1?: string;
    line2?: string;
    city?: string;
    postalCode?: string;
    countryCode?: string;
  };
  location: {
    latitude: number;
    longitude: number;
  };
  type: PaczkomatType | string;
  status: string;
  openingHours?: string;
  distance?: number;
  isActive?: boolean;
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
    const body = await response.json().catch(() => ({ message: `HTTP ${response.status}` })) as { message?: string };
    throw new ApiClientError(response.status, body.message ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function usePaczkomaty(lat: number | null, lng: number | null, radius = 5) {
  const { user, accessToken } = useAuthStore();

  return useQuery<PaczkomatPoint[], ApiClientError>({
    queryKey: ['paczkomaty', lat, lng, radius],
    queryFn: async () => {
      const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        radius: String(radius),
      });
      const response = await fetch(`/api/v1/logistics/paczkomaty?${params.toString()}`, {
        headers: buildHeaders(user?.id, accessToken),
      });
      return handleResponse<PaczkomatPoint[]>(response);
    },
    enabled: lat !== null && lng !== null,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function usePaczkomatByName(name: string) {
  const { user, accessToken } = useAuthStore();

  return useQuery<PaczkomatPoint, ApiClientError>({
    queryKey: ['paczkomat-by-name', name],
    queryFn: async () => {
      const response = await fetch(`/api/v1/logistics/paczkomaty/${encodeURIComponent(name)}`, {
        headers: buildHeaders(user?.id, accessToken),
      });
      return handleResponse<PaczkomatPoint>(response);
    },
    enabled: name.trim().length >= 3,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
