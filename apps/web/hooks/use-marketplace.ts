'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { ApiClientError } from '@/lib/api';

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returned';

export interface MarketplaceOrder {
  id: string;
  externalId: string;
  buyer: {
    name: string;
    email?: string;
    city?: string;
  };
  items: Array<{
    name: string;
    sku: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalAmount: number;
  currency: string;
  status: OrderStatus;
  platform: string;
  createdAt: string;
  updatedAt: string;
  trackingNumber?: string;
}

export interface OrdersResponse {
  items: MarketplaceOrder[];
  total: number;
  page: number;
  limit: number;
}

export type AccountStatus = 'active' | 'suspended' | 'pending' | 'disconnected';

export interface MarketplaceAccount {
  id: string;
  platform: string;
  platformLabel: string;
  accountName: string;
  status: AccountStatus;
  connectedAt: string;
  lastSyncAt?: string;
  ordersCount: number;
  revenueTotal: number;
  currency: string;
}

export interface AccountsResponse {
  items: MarketplaceAccount[];
  total: number;
}

function buildAuthHeaders(userId: string | undefined, token: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (userId) headers['x-user-id'] = userId;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export function useOrders() {
  const { user, accessToken } = useAuthStore();

  return useQuery<OrdersResponse, ApiClientError>({
    queryKey: ['marketplace-orders'],
    queryFn: async () => {
      const response = await fetch('/api/v1/marketplace/orders', {
        headers: buildAuthHeaders(user?.id, accessToken),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        const errMsg = json.error?.message ?? json.message ?? `HTTP ${response.status}`;
        throw new ApiClientError(response.status, errMsg);
      }

      const json = await response.json() as Record<string, unknown>;
      // Handle {success:false, error:{...}} or upstream error shapes
      if (json['success'] === false) {
        const errMsg = (json['error'] as { message?: string } | undefined)?.message ?? 'Request failed';
        throw new ApiClientError(400, errMsg);
      }
      const raw = (json['data'] ?? json) as Record<string, unknown>;
      // API may return a plain array or {items:[...], total:N}
      if (Array.isArray(raw)) {
        return { items: raw as MarketplaceOrder[], total: (raw as unknown[]).length, page: 1, limit: (raw as unknown[]).length };
      }
      if (Array.isArray(raw['items'])) {
        return raw as unknown as OrdersResponse;
      }
      return { items: [], total: 0, page: 1, limit: 0 };
    },
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
}

export function useAccounts() {
  const { user, accessToken } = useAuthStore();

  return useQuery<AccountsResponse, ApiClientError>({
    queryKey: ['marketplace-accounts'],
    queryFn: async () => {
      const response = await fetch('/api/v1/marketplace/accounts', {
        headers: buildAuthHeaders(user?.id, accessToken),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        const errMsg = json.error?.message ?? json.message ?? `HTTP ${response.status}`;
        throw new ApiClientError(response.status, errMsg);
      }

      const json = await response.json() as Record<string, unknown>;
      if (json['success'] === false) {
        const errMsg = (json['error'] as { message?: string } | undefined)?.message ?? 'Request failed';
        throw new ApiClientError(400, errMsg);
      }
      const raw = (json['data'] ?? json) as Record<string, unknown>;
      if (Array.isArray(raw)) {
        return { items: raw as MarketplaceAccount[], total: (raw as unknown[]).length };
      }
      if (Array.isArray(raw['items'])) {
        return raw as unknown as AccountsResponse;
      }
      return { items: [], total: 0 };
    },
    staleTime: 5 * 60 * 1000,
  });
}
