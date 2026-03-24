'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { ApiClientError } from '@/lib/api';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface LegalTopic {
  id: string;
  slug: string;
  /** Title already localized by the server for the requested lang */
  title: string;
  summary: string;
  content?: string;
  faq?: Array<{ q: string; a: string }>;
  category: string;
  updatedAt: string;
  lang: string;
  tags?: string[];
  sortOrder?: number;
}

export interface LegalTopicsResponse {
  items: LegalTopic[];
  total: number;
}

export interface LegalLimit {
  name: string;
  value: number;
  currency: string;
  description: string;
  category: string;
  effectiveFrom: string;
}

export interface LegalLimitsResponse {
  year: number;
  limits: LegalLimit[];
}

export interface LegalSearchResponse {
  items: LegalTopic[];
  total: number;
}

// ─── Lang mapping ─────────────────────────────────────────────────────────────

/**
 * Maps Next.js locale codes to the lang codes the legal-service API accepts.
 * The API uses: ru | pl | uk | en
 */
export function localeLang(locale: string): string {
  const map: Record<string, string> = {
    ru: 'ru',
    pl: 'pl',
    ua: 'uk',
    uk: 'uk',
    en: 'en',
  };
  return map[locale] ?? 'ru';
}

// ─── Normalization helpers ────────────────────────────────────────────────────

/**
 * The list endpoint returns {slug, title, category, tags, sortOrder}.
 * The detail endpoint returns the same fields + content, faq, lang.
 * Both are already localized server-side when a `lang` param is provided.
 */
function normalizeTopic(raw: Record<string, unknown>, index: number): LegalTopic {
  return {
    id:
      (raw['id'] as string | undefined) ??
      (raw['slug'] as string | undefined) ??
      String(index),
    slug: (raw['slug'] as string | undefined) ?? '',
    title: (raw['title'] as string | undefined) ?? '',
    summary: (raw['summary'] as string | undefined) ?? '',
    content: raw['content'] as string | undefined,
    faq: raw['faq'] as Array<{ q: string; a: string }> | undefined,
    category: (raw['category'] as string | undefined) ?? '',
    updatedAt:
      (raw['updatedAt'] as string | undefined) ?? new Date().toISOString(),
    lang: (raw['lang'] as string | undefined) ?? 'ru',
    tags: raw['tags'] as string[] | undefined,
    sortOrder: raw['sortOrder'] as number | undefined,
  };
}

/**
 * The limits API returns `limits` as a flat {key: number} object.
 * This converts it to the LegalLimit[] array shape.
 */
function normalizeLimits(raw: Record<string, unknown>): LegalLimitsResponse {
  const limitsObj = (raw['limits'] ?? {}) as Record<string, unknown>;

  const LABEL_MAP: Record<
    string,
    {
      name: string;
      currency: string;
      description: string;
      category: string;
    }
  > = {
    min_wage_jan_jun: {
      name: 'Płaca minimalna (I–VI)',
      currency: 'PLN',
      description: 'Styczeń–Czerwiec',
      category: 'Wynagrodzenie minimalne',
    },
    min_wage_jul_dec: {
      name: 'Płaca minimalna (VII–XII)',
      currency: 'PLN',
      description: 'Lipiec–Grudzień',
      category: 'Wynagrodzenie minimalne',
    },
    nierejestrowana_monthly: {
      name: 'Limit miesięczny',
      currency: 'PLN',
      description: 'Działalność nierejestrowana',
      category: 'Działalność nierejestrowana',
    },
    nierejestrowana_yearly: {
      name: 'Limit roczny',
      currency: 'PLN',
      description: 'Działalność nierejestrowana',
      category: 'Działalność nierejestrowana',
    },
    vat_threshold: {
      name: 'Próg rejestracji VAT',
      currency: 'PLN',
      description: 'Zwolnienie podmiotowe',
      category: 'VAT',
    },
    vat_standard: {
      name: 'Stawka podstawowa',
      currency: '%',
      description: 'VAT 23%',
      category: 'VAT',
    },
    vat_reduced: {
      name: 'Stawka obniżona',
      currency: '%',
      description: 'VAT 8%',
      category: 'VAT',
    },
    vat_super_reduced: {
      name: 'Stawka super-obniżona',
      currency: '%',
      description: 'VAT 5%',
      category: 'VAT',
    },
    zus_preferential_social: {
      name: 'Składki preferencyjne',
      currency: 'PLN',
      description: 'Ulga na start / małe ZUS',
      category: 'ZUS',
    },
    zus_reduced_social: {
      name: 'Małe ZUS Plus',
      currency: 'PLN',
      description: 'Składki społeczne',
      category: 'ZUS',
    },
    zus_full_emerytalne: {
      name: 'Emerytalne (pełne)',
      currency: 'PLN',
      description: 'Składki społeczne',
      category: 'ZUS',
    },
    zus_full_rentowe: {
      name: 'Rentowe (pełne)',
      currency: 'PLN',
      description: 'Składki społeczne',
      category: 'ZUS',
    },
    zus_full_chorobowe: {
      name: 'Chorobowe (pełne)',
      currency: 'PLN',
      description: 'Składki społeczne',
      category: 'ZUS',
    },
    zus_full_wypadkowe: {
      name: 'Wypadkowe (pełne)',
      currency: 'PLN',
      description: 'Składki społeczne',
      category: 'ZUS',
    },
    zus_full_fp: {
      name: 'Fundusz Pracy (pełny)',
      currency: 'PLN',
      description: 'Składki społeczne',
      category: 'ZUS',
    },
    zus_health_min: {
      name: 'Składka zdrowotna (min)',
      currency: 'PLN',
      description: 'Ubezpieczenie zdrowotne',
      category: 'ZUS',
    },
    zus_health_pct: {
      name: 'Składka zdrowotna %',
      currency: '%',
      description: 'Ubezpieczenie zdrowotne',
      category: 'ZUS',
    },
  };

  const CATEGORY_PREFIXES: Array<[string, string]> = [
    ['min_wage', 'Wynagrodzenie minimalne'],
    ['nierejestrowana', 'Działalność nierejestrowana'],
    ['vat', 'VAT'],
    ['zus', 'ZUS'],
  ];

  const limits: LegalLimit[] = Object.entries(limitsObj)
    .filter(([, v]) => typeof v === 'number')
    .map(([key, value]) => {
      const meta = LABEL_MAP[key];
      const matched = CATEGORY_PREFIXES.find(([prefix]) => key.startsWith(prefix));
      return {
        name: meta?.name ?? key,
        value: value as number,
        currency: meta?.currency ?? 'PLN',
        description: meta?.description ?? '',
        category: meta?.category ?? matched?.[1] ?? 'Inne',
        effectiveFrom: `${String(raw['year'] ?? new Date().getFullYear())}-01-01`,
      };
    });

  return {
    year: (raw['year'] as number | undefined) ?? new Date().getFullYear(),
    limits,
  };
}

function normalizeTopicsResponse(raw: unknown): LegalTopicsResponse {
  if (Array.isArray(raw)) {
    const items = (raw as Record<string, unknown>[]).map(normalizeTopic);
    return { items, total: items.length };
  }
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj['items'])) {
    const items = (obj['items'] as Record<string, unknown>[]).map(normalizeTopic);
    return {
      items,
      total: (obj['total'] as number | undefined) ?? items.length,
    };
  }
  return { items: [], total: 0 };
}

function buildAuthHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useLegalTopics(lang = 'ru') {
  const { accessToken } = useAuthStore();

  return useQuery<LegalTopicsResponse, ApiClientError>({
    queryKey: ['legal-topics', lang],
    queryFn: async () => {
      const params = new URLSearchParams({ lang });
      const response = await fetch(
        `/api/v1/legal/topics?${params.toString()}`,
        { headers: buildAuthHeaders(accessToken) },
      );

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        const errMsg =
          (json as { error?: { message?: string }; message?: string })
            .error?.message ??
          (json as { message?: string }).message ??
          `HTTP ${response.status}`;
        throw new ApiClientError(response.status, errMsg);
      }

      const json = await response.json();
      const raw = (json as { data?: unknown }).data ?? json;
      return normalizeTopicsResponse(raw);
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useLegalTopic(slug: string | null, lang = 'ru') {
  const { accessToken } = useAuthStore();

  return useQuery<LegalTopic, ApiClientError>({
    queryKey: ['legal-topic', slug, lang],
    queryFn: async () => {
      const params = new URLSearchParams({ lang });
      const response = await fetch(
        `/api/v1/legal/topics/${slug}?${params.toString()}`,
        { headers: buildAuthHeaders(accessToken) },
      );

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        const errMsg =
          (json as { error?: { message?: string }; message?: string })
            .error?.message ??
          (json as { message?: string }).message ??
          `HTTP ${response.status}`;
        throw new ApiClientError(response.status, errMsg);
      }

      const json = await response.json();
      const raw = (json as { data?: unknown }).data ?? json;
      return normalizeTopic(raw as Record<string, unknown>, 0);
    },
    enabled: !!slug,
    staleTime: 30 * 60 * 1000,
  });
}

export function useLegalLimits(year: number) {
  const { accessToken } = useAuthStore();

  return useQuery<LegalLimitsResponse, ApiClientError>({
    queryKey: ['legal-limits', year],
    queryFn: async () => {
      const response = await fetch(`/api/v1/legal/limits/${year}`, {
        headers: buildAuthHeaders(accessToken),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        const errMsg =
          (json as { error?: { message?: string }; message?: string })
            .error?.message ??
          (json as { message?: string }).message ??
          `HTTP ${response.status}`;
        throw new ApiClientError(response.status, errMsg);
      }

      const json = await response.json();
      const raw = (json as { data?: unknown }).data ?? json;
      return normalizeLimits(raw as Record<string, unknown>);
    },
    staleTime: 24 * 60 * 60 * 1000,
  });
}

/**
 * Search hook. Pass a debounced query string — the hook only fires when
 * `q.trim().length >= 2`.
 */
export function useLegalSearch(q: string, lang = 'ru') {
  const { accessToken } = useAuthStore();

  return useQuery<LegalSearchResponse, ApiClientError>({
    queryKey: ['legal-search', q, lang],
    queryFn: async () => {
      const params = new URLSearchParams({ q, lang });
      const response = await fetch(
        `/api/v1/legal/search?${params.toString()}`,
        { headers: buildAuthHeaders(accessToken) },
      );

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        const errMsg =
          (json as { error?: { message?: string }; message?: string })
            .error?.message ??
          (json as { message?: string }).message ??
          `HTTP ${response.status}`;
        throw new ApiClientError(response.status, errMsg);
      }

      const json = await response.json();
      const raw = (json as { data?: unknown }).data ?? json;
      return normalizeTopicsResponse(raw) as LegalSearchResponse;
    },
    enabled: q.trim().length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}
