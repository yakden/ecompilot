// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

export type Plan = "free" | "pro" | "business";
export type Language = "ru" | "pl" | "ua" | "en";
export type Theme = "dark" | "light" | "system";

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

export interface User {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly plan: Plan;
  readonly language: Language;
  readonly createdAt: string;
}

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface RegisterRequest {
  readonly email: string;
  readonly password: string;
  readonly name: string;
  readonly language: Language;
}

export interface AuthResponse {
  readonly user: User;
  readonly tokens: AuthTokens;
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics / Niche
// ─────────────────────────────────────────────────────────────────────────────

export type DemandLevel = "low" | "medium" | "high" | "very_high";
export type CompetitionLevel = "low" | "medium" | "high" | "very_high";

export interface NicheAnalysis {
  readonly id: string;
  readonly keyword: string;
  readonly score: number;
  readonly demandLevel: DemandLevel;
  readonly competitionLevel: CompetitionLevel;
  readonly monthlySearches: number;
  readonly avgPrice: number;
  readonly avgMargin: number;
  readonly trendDirection: "up" | "down" | "stable";
  readonly topMarketplaces: readonly string[];
  readonly analyzedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Chat
// ─────────────────────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  readonly id: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly createdAt: string;
  readonly isStreaming?: boolean;
}

export interface ChatSession {
  readonly id: string;
  readonly messages: readonly ChatMessage[];
  readonly createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculator
// ─────────────────────────────────────────────────────────────────────────────

export interface MarginCalculation {
  readonly purchasePrice: number;
  readonly sellingPrice: number;
  readonly shippingCost: number;
  readonly platformFeePercent: number;
  readonly vatPercent: number;
  readonly margin: number;
  readonly marginPercent: number;
  readonly profit: number;
  readonly roi: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scanner / Product
// ─────────────────────────────────────────────────────────────────────────────

export interface Product {
  readonly id: string;
  readonly ean: string;
  readonly name: string;
  readonly brand: string | null;
  readonly category: string | null;
  readonly imageUrl: string | null;
  readonly avgPrice: number | null;
  readonly currency: string;
}

export type BarcodeFormat =
  | "ean13"
  | "ean8"
  | "code128"
  | "code39"
  | "qr"
  | "upc_a"
  | "upc_e";

export interface ScanResult {
  readonly data: string;
  readonly type: BarcodeFormat;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Responses
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  readonly success: true;
  readonly data: T;
  readonly meta?: {
    readonly page?: number;
    readonly limit?: number;
    readonly total?: number;
  };
}

export interface ApiError {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Readonly<Record<string, unknown>>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─────────────────────────────────────────────────────────────────────────────
// Notification
// ─────────────────────────────────────────────────────────────────────────────

export interface PushNotificationData {
  readonly type: "niche_alert" | "ai_response" | "plan_update" | "system";
  readonly screen?: string;
  readonly params?: Readonly<Record<string, string>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan limits
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanLimits {
  readonly nicheAnalysis: number;
  readonly aiMessages: number;
  readonly scannerAccess: boolean;
  readonly csvExport: boolean;
}

export const PLAN_LIMITS = {
  free: {
    nicheAnalysis: 5,
    aiMessages: 3,
    scannerAccess: true,
    csvExport: false,
  },
  pro: {
    nicheAnalysis: -1,
    aiMessages: -1,
    scannerAccess: true,
    csvExport: true,
  },
  business: {
    nicheAnalysis: -1,
    aiMessages: -1,
    scannerAccess: true,
    csvExport: true,
  },
} as const satisfies Record<Plan, PlanLimits>;
