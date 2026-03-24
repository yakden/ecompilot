const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface FetchOptions {
  method?: RequestMethod;
  body?: unknown;
  headers?: Record<string, string>;
  token?: string;
  cache?: RequestCache;
  tags?: string[];
  revalidate?: number;
}

interface ApiError {
  message: string;
  statusCode: number;
  error?: string;
}

export class ApiClientError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function fetchApi<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    body,
    headers = {},
    token,
    cache,
    tags,
    revalidate,
  } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  const fetchOptions: RequestInit = {
    method,
    headers: requestHeaders,
  };

  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  if (cache) {
    fetchOptions.cache = cache;
  }

  if (tags ?? revalidate !== undefined) {
    fetchOptions.next = {
      ...(tags ? { tags } : {}),
      ...(revalidate !== undefined ? { revalidate } : {}),
    };
  }

  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    let errorData: ApiError | undefined;
    try {
      errorData = (await response.json()) as ApiError;
    } catch {
      // ignore parse error
    }
    throw new ApiClientError(
      response.status,
      errorData?.message ?? `HTTP Error ${response.status}`,
      errorData
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(endpoint: string, options?: Omit<FetchOptions, 'method' | 'body'>) =>
    fetchApi<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body: unknown, options?: Omit<FetchOptions, 'method'>) =>
    fetchApi<T>(endpoint, { ...options, method: 'POST', body }),

  put: <T>(endpoint: string, body: unknown, options?: Omit<FetchOptions, 'method'>) =>
    fetchApi<T>(endpoint, { ...options, method: 'PUT', body }),

  patch: <T>(endpoint: string, body: unknown, options?: Omit<FetchOptions, 'method'>) =>
    fetchApi<T>(endpoint, { ...options, method: 'PATCH', body }),

  delete: <T>(endpoint: string, options?: Omit<FetchOptions, 'method' | 'body'>) =>
    fetchApi<T>(endpoint, { ...options, method: 'DELETE' }),
};
