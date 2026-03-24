'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { ApiClientError } from '@/lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface VatVerifyPayload {
  countryCode: string;
  vatNumber: string;
}

export interface VatVerifyResult {
  valid: boolean;
  vatNumber: string;
  countryCode: string;
  name?: string;
  address?: string;
  requestDate?: string;
}

export interface KrsVerifyResult {
  krsNumber: string;
  companyName?: string;
  nip?: string;
  regon?: string;
  legalForm?: string;
  status?: string;
  registrationDate?: string;
  address?: string;
}

export interface NipVerifyResult {
  nip: string;
  companyName?: string;
  regon?: string;
  status?: string;
  vatStatus?: string;
  address?: string;
  registrationDate?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth headers helper
// ─────────────────────────────────────────────────────────────────────────────

function buildHeaders(userId: string | undefined, token: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
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

export function useVerifyVat() {
  const { user, accessToken } = useAuthStore();

  return useMutation<VatVerifyResult, ApiClientError, VatVerifyPayload>({
    mutationFn: async (payload) => {
      const response = await fetch('/api/v1/auth/verify-vat', {
        method: 'POST',
        headers: buildHeaders(user?.id, accessToken),
        body: JSON.stringify(payload),
      });
      return handleResponse<VatVerifyResult>(response);
    },
  });
}

export function useVerifyKrs(krsNumber: string) {
  const { user, accessToken } = useAuthStore();

  return useQuery<KrsVerifyResult, ApiClientError>({
    queryKey: ['verify-krs', krsNumber],
    queryFn: async () => {
      const response = await fetch(`/api/v1/suppliers/verify-krs/${encodeURIComponent(krsNumber)}`, {
        headers: buildHeaders(user?.id, accessToken),
      });
      return handleResponse<KrsVerifyResult>(response);
    },
    enabled: krsNumber.trim().length >= 9,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useVerifyNip(nip: string) {
  const { user, accessToken } = useAuthStore();

  return useQuery<NipVerifyResult, ApiClientError>({
    queryKey: ['verify-nip', nip],
    queryFn: async () => {
      const response = await fetch(`/api/v1/suppliers/verify-nip/${encodeURIComponent(nip)}`, {
        headers: buildHeaders(user?.id, accessToken),
      });
      return handleResponse<NipVerifyResult>(response);
    },
    enabled: nip.replace(/\D/g, '').length === 10,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
