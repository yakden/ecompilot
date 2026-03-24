// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Type-safe API client
// ─────────────────────────────────────────────────────────────────────────────

import type { ApiResponse, ApiError } from "@/types";

const BASE_URL =
  process.env["EXPO_PUBLIC_API_URL"] ?? "https://api.ecompilot.pl";

// ─────────────────────────────────────────────────────────────────────────────
// Token store (lazy import to avoid circular deps)
// ─────────────────────────────────────────────────────────────────────────────

type TokenGetter = () => string | null;
type TokenRefresher = () => Promise<string | null>;

let _getToken: TokenGetter = () => null;
let _refreshToken: TokenRefresher = async () => null;

export function configureApiClient(opts: {
  getToken: TokenGetter;
  refreshToken: TokenRefresher;
}): void {
  _getToken = opts.getToken;
  _refreshToken = opts.refreshToken;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error types
// ─────────────────────────────────────────────────────────────────────────────

export class ApiRequestError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class NetworkError extends Error {
  constructor(message = "Network request failed") {
    super(message);
    this.name = "NetworkError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch wrapper
// ─────────────────────────────────────────────────────────────────────────────

interface RequestOptions {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  readonly skipAuth?: boolean;
}

async function apiFetch<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, headers: extraHeaders, signal, skipAuth = false } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extraHeaders,
  };

  if (!skipAuth) {
    const token = _getToken();
    if (token !== null) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch {
    throw new NetworkError();
  }

  // Handle 401 with token refresh
  if (response.status === 401 && !skipAuth) {
    const newToken = await _refreshToken();
    if (newToken !== null) {
      headers["Authorization"] = `Bearer ${newToken}`;
      try {
        response = await fetch(`${BASE_URL}${path}`, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal,
        });
      } catch {
        throw new NetworkError();
      }
    }
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiRequestError(response.status, "PARSE_ERROR", "Invalid JSON response");
  }

  const apiResponse = json as ApiResponse<T>;

  if (!apiResponse.success) {
    const err = (apiResponse as ApiError).error;
    throw new ApiRequestError(response.status, err.code, err.message);
  }

  return apiResponse.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE streaming for AI chat
// ─────────────────────────────────────────────────────────────────────────────

export interface StreamChunk {
  readonly type: "delta" | "done" | "error";
  readonly content?: string;
  readonly error?: string;
}

export async function* streamChat(
  sessionId: string,
  message: string,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk, void, unknown> {
  const token = _getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };

  if (token !== null) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/v1/ai/chat/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId, message }),
      signal,
    });
  } catch {
    yield { type: "error", error: "Network request failed" };
    return;
  }

  if (!response.ok || response.body === null) {
    yield { type: "error", error: "Stream unavailable" };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    let done: boolean;
    let value: Uint8Array | undefined;

    try {
      ({ done, value } = await reader.read());
    } catch {
      yield { type: "error", error: "Stream read failed" };
      break;
    }

    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") {
          yield { type: "done" };
          return;
        }
        try {
          const parsed = JSON.parse(raw) as StreamChunk;
          yield parsed;
        } catch {
          // Skip malformed SSE lines
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth endpoints
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
} from "@/types";

export const authApi = {
  login: (data: LoginRequest) =>
    apiFetch<AuthResponse>("/v1/auth/login", {
      method: "POST",
      body: data,
      skipAuth: true,
    }),

  register: (data: RegisterRequest) =>
    apiFetch<AuthResponse>("/v1/auth/register", {
      method: "POST",
      body: data,
      skipAuth: true,
    }),

  refresh: (refreshToken: string) =>
    apiFetch<{ accessToken: string; expiresAt: number }>("/v1/auth/refresh", {
      method: "POST",
      body: { refreshToken },
      skipAuth: true,
    }),

  logout: () =>
    apiFetch<void>("/v1/auth/logout", { method: "POST" }),

  googleAuth: (idToken: string) =>
    apiFetch<AuthResponse>("/v1/auth/google", {
      method: "POST",
      body: { idToken },
      skipAuth: true,
    }),

  registerPushToken: (fcmToken: string, platform: "ios" | "android") =>
    apiFetch<void>("/v1/notifications/register", {
      method: "POST",
      body: { token: fcmToken, platform },
    }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Analytics endpoints
// ─────────────────────────────────────────────────────────────────────────────

import type { NicheAnalysis } from "@/types";

export const analyticsApi = {
  analyze: (keyword: string, signal?: AbortSignal) =>
    apiFetch<NicheAnalysis>("/v1/analytics/niche", {
      method: "POST",
      body: { keyword },
      signal,
    }),

  getHistory: (page = 1, limit = 20) =>
    apiFetch<readonly NicheAnalysis[]>(
      `/v1/analytics/niche/history?page=${page}&limit=${limit}`
    ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Scanner / Product endpoints
// ─────────────────────────────────────────────────────────────────────────────

import type { Product } from "@/types";

export const productApi = {
  findByEan: (ean: string, signal?: AbortSignal) =>
    apiFetch<Product>(`/v1/products/ean/${encodeURIComponent(ean)}`, {
      signal,
    }),
};

// ─────────────────────────────────────────────────────────────────────────────
// AI Chat endpoints
// ─────────────────────────────────────────────────────────────────────────────

import type { ChatSession, ChatMessage } from "@/types";

export const chatApi = {
  createSession: () =>
    apiFetch<ChatSession>("/v1/ai/chat/sessions", { method: "POST" }),

  getSession: (sessionId: string) =>
    apiFetch<ChatSession>(`/v1/ai/chat/sessions/${sessionId}`),

  sendMessage: (sessionId: string, content: string) =>
    apiFetch<ChatMessage>("/v1/ai/chat/messages", {
      method: "POST",
      body: { sessionId, content },
    }),

  getSessions: () =>
    apiFetch<readonly ChatSession[]>("/v1/ai/chat/sessions"),
};
