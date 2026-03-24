'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { ApiClientError } from '@/lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type InvoiceType = 'VAT' | 'KOR' | 'ZAL';
export type InvoiceStatus =
  | 'draft'
  | 'pending'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'offline';
export type PaymentMethod = 'przelew' | 'gotowka' | 'karta' | 'blik';
export type VatRate = 23 | 8 | 5 | 0;

export interface InvoiceLine {
  productName: string;
  quantity: number;
  unitPriceNet: number;
  vatRate: VatRate;
  netAmount: number;
  grossAmount: number;
}

export interface Invoice {
  id: string;
  userId: string;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  issueDate: string;
  dueDate: string;
  buyerNip: string;
  buyerName: string;
  buyerAddress: string;
  lines: InvoiceLine[];
  netTotal: number;
  vatTotal: number;
  grossTotal: number;
  paymentMethod: PaymentMethod;
  status: InvoiceStatus;
  ksefNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoicesListResponse {
  data: Invoice[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

export interface CreateInvoicePayload {
  invoiceType: InvoiceType;
  issueDate: string;
  dueDate: string;
  buyerNip: string;
  buyerName: string;
  buyerAddress: string;
  lines: Omit<InvoiceLine, 'netAmount' | 'grossAmount'>[];
  paymentMethod: PaymentMethod;
}

export interface GtuCode {
  code: string;
  description: string;
  whenToUse: string;
}

export interface KsefStatusResponse {
  connected: boolean;
  lastChecked: string;
  message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query key factory
// ─────────────────────────────────────────────────────────────────────────────

export const ksefKeys = {
  all: ['ksef'] as const,
  invoices: () => [...ksefKeys.all, 'invoices'] as const,
  invoice: (id: string) => [...ksefKeys.all, 'invoice', id] as const,
  gtuCodes: () => [...ksefKeys.all, 'gtu-codes'] as const,
  status: () => [...ksefKeys.all, 'status'] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Auth headers helper
// ─────────────────────────────────────────────────────────────────────────────

function buildAuthHeaders(
  userId: string | undefined,
  plan: string | undefined,
  accessToken: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {};
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
  if (json.data !== undefined && json.pagination !== undefined) {
    return json as T;
  }
  if (json.success !== undefined && json.data !== undefined) {
    return json.data as T;
  }
  return (json.data ?? json) as T;
}

const BASE = '/api/v1/ksef';

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useInvoices() {
  const { user, accessToken } = useAuthStore();

  return useQuery<InvoicesListResponse, ApiClientError>({
    queryKey: ksefKeys.invoices(),
    queryFn: async () => {
      const headers = buildAuthHeaders(user?.id, user?.plan, accessToken);
      const response = await fetch(`${BASE}/invoices`, { headers });
      return handleResponse<InvoicesListResponse>(response);
    },
    staleTime: 30_000,
  });
}

export function useCreateInvoice() {
  const { user, accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation<Invoice, ApiClientError, CreateInvoicePayload>({
    mutationFn: async (payload) => {
      const headers = {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(user?.id, user?.plan, accessToken),
      };
      const response = await fetch(`${BASE}/invoices`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      return handleResponse<Invoice>(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ksefKeys.invoices() });
    },
  });
}

export function useSubmitInvoice(id: string) {
  const { user, accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation<Invoice, ApiClientError, void>({
    mutationFn: async () => {
      const headers = {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(user?.id, user?.plan, accessToken),
      };
      const response = await fetch(`${BASE}/invoices/${id}/submit`, {
        method: 'POST',
        headers,
      });
      return handleResponse<Invoice>(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ksefKeys.invoices() });
      void queryClient.invalidateQueries({ queryKey: ksefKeys.invoice(id) });
    },
  });
}

export function useGtuCodes() {
  const { user, accessToken } = useAuthStore();

  return useQuery<GtuCode[], ApiClientError>({
    queryKey: ksefKeys.gtuCodes(),
    queryFn: async () => {
      const headers = buildAuthHeaders(user?.id, user?.plan, accessToken);
      const response = await fetch(`${BASE}/gtu-codes`, { headers });
      return handleResponse<GtuCode[]>(response);
    },
    staleTime: 60 * 60 * 1000,
  });
}

export function useKsefStatus() {
  const { user, accessToken } = useAuthStore();

  return useQuery<KsefStatusResponse, ApiClientError>({
    queryKey: ksefKeys.status(),
    queryFn: async () => {
      const headers = buildAuthHeaders(user?.id, user?.plan, accessToken);
      const response = await fetch(`${BASE}/status`, { headers });
      return handleResponse<KsefStatusResponse>(response);
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
