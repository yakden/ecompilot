'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { ApiClientError } from '@/lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ServiceName =
  | 'allegro'
  | 'google_search'
  | 'openai'
  | 'stripe'
  | 'serpapi';

export interface IntegrationMetadata {
  connectedEmail?: string;
  expiresAt?: string;
  scopes?: string[];
  displayName?: string;
}

export interface Integration {
  service: ServiceName;
  isActive: boolean | null;
  metadata: IntegrationMetadata | null;
  maskedKey: string;
  createdAt: string | null;
}

export interface IntegrationKeys {
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  webhookSecret?: string;
  searchEngineId?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface SaveIntegrationResult {
  success: boolean;
  service: ServiceName;
  maskedKey: string;
}

export interface TestIntegrationResult {
  success: boolean;
  working: boolean;
  error?: string;
}

export interface AllegroAuthorizeResult {
  success: boolean;
  authUrl: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth headers helper
// ─────────────────────────────────────────────────────────────────────────────

function buildHeaders(
  userId: string | undefined,
  token: string | null,
  plan?: string,
): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (userId) headers['x-user-id'] = userId;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (plan) headers['x-user-plan'] = plan;
  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ message: `HTTP ${response.status}` })) as { message?: string };
    throw new ApiClientError(response.status, body.message ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useIntegrations() {
  const { user, accessToken } = useAuthStore();

  return useQuery<Integration[], ApiClientError>({
    queryKey: ['integrations', user?.id],
    queryFn: async () => {
      const response = await fetch('/api/v1/auth/integrations', {
        headers: buildHeaders(user?.id, accessToken, user?.plan),
      });
      const data = await handleResponse<{ success: boolean; data: { integrations: Integration[] } }>(response);
      return data.data.integrations;
    },
    enabled: !!user?.id && !!accessToken,
    staleTime: 30_000,
    retry: false,
  });
}

export function useSaveIntegration(service: ServiceName) {
  const { user, accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation<SaveIntegrationResult, ApiClientError, IntegrationKeys>({
    mutationFn: async (keys) => {
      const response = await fetch(`/api/v1/auth/integrations/${service}`, {
        method: 'PUT',
        headers: buildHeaders(user?.id, accessToken, user?.plan),
        body: JSON.stringify({ keys }),
      });
      return handleResponse<SaveIntegrationResult>(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations', user?.id] });
    },
  });
}

export function useDeleteIntegration(service: ServiceName) {
  const { user, accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, ApiClientError, void>({
    mutationFn: async () => {
      const response = await fetch(`/api/v1/auth/integrations/${service}`, {
        method: 'DELETE',
        headers: buildHeaders(user?.id, accessToken, user?.plan),
      });
      return handleResponse<{ success: boolean }>(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations', user?.id] });
    },
  });
}

export function useTestIntegration(service: ServiceName) {
  const { user, accessToken } = useAuthStore();

  return useMutation<TestIntegrationResult, ApiClientError, void>({
    mutationFn: async () => {
      const response = await fetch(`/api/v1/auth/integrations/${service}/test`, {
        method: 'POST',
        headers: buildHeaders(user?.id, accessToken, user?.plan),
      });
      return handleResponse<TestIntegrationResult>(response);
    },
  });
}

export function useAllegroAuthorize() {
  const { user, accessToken } = useAuthStore();

  return useMutation<AllegroAuthorizeResult, ApiClientError, void>({
    mutationFn: async () => {
      const response = await fetch('/api/v1/auth/integrations/allegro/authorize', {
        headers: buildHeaders(user?.id, accessToken, user?.plan),
      });
      return handleResponse<AllegroAuthorizeResult>(response);
    },
  });
}
