// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — Shared Types
// Strict TypeScript 5.4+ with noUncheckedIndexedAccess
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Language & Locale
// ─────────────────────────────────────────────────────────────────────────────

export type Language = "ru" | "pl" | "ua" | "en";

export const SUPPORTED_LANGUAGES = ["ru", "pl", "ua", "en"] as const satisfies readonly Language[];

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Plans
// ─────────────────────────────────────────────────────────────────────────────

export type Plan = "free" | "pro" | "business";

export const PLANS = ["free", "pro", "business"] as const satisfies readonly Plan[];

// ─────────────────────────────────────────────────────────────────────────────
// Plan Limits — -1 means unlimited
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanLimits {
  readonly nicheAnalysis: number;
  readonly aiMessages: number;
  readonly photoGenerations: number;
  readonly suppliersAccess: boolean;
  readonly csvExport: boolean;
  readonly apiAccess: boolean;
  readonly teamMembers: number;
}

export const PLAN_LIMITS = {
  free: {
    nicheAnalysis: 5,
    aiMessages: 3,
    photoGenerations: 0,
    suppliersAccess: false,
    csvExport: false,
    apiAccess: false,
    teamMembers: 1,
  },
  pro: {
    nicheAnalysis: -1,
    aiMessages: -1,
    photoGenerations: 50,
    suppliersAccess: true,
    csvExport: true,
    apiAccess: false,
    teamMembers: 1,
  },
  business: {
    nicheAnalysis: -1,
    aiMessages: -1,
    photoGenerations: -1,
    suppliersAccess: true,
    csvExport: true,
    apiAccess: true,
    teamMembers: 5,
  },
} as const satisfies Record<Plan, PlanLimits>;

export type PlanLimitsMap = typeof PLAN_LIMITS;

/** Returns true if the given limit is unlimited (-1) */
export function isUnlimited(limit: number): boolean {
  return limit === -1;
}

/** Returns true if usage is within the plan limit */
export function isWithinLimit(current: number, limit: number): boolean {
  return limit === -1 || current < limit;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Names
// ─────────────────────────────────────────────────────────────────────────────

export type ServiceName =
  | "auth-service"
  | "analytics-service"
  | "suppliers-service"
  | "calc-service"
  | "ai-service"
  | "billing-service"
  | "content-service"
  | "legal-service"
  | "academy-service"
  | "community-service"
  | "notification-service"
  | "api-gateway"
  | "marketplace-hub"
  | "logistics-engine"
  | "ksef-service"
  | "payment-reconciliation";

export const SERVICE_NAMES = [
  "auth-service",
  "analytics-service",
  "suppliers-service",
  "calc-service",
  "ai-service",
  "billing-service",
  "content-service",
  "legal-service",
  "academy-service",
  "community-service",
  "notification-service",
  "api-gateway",
  "marketplace-hub",
  "logistics-engine",
  "ksef-service",
  "payment-reconciliation",
] as const satisfies readonly ServiceName[];

// ─────────────────────────────────────────────────────────────────────────────
// Branded types for domain safety
// ─────────────────────────────────────────────────────────────────────────────

declare const __brand: unique symbol;
type Brand<T, TBrand extends string> = T & { readonly [__brand]: TBrand };

export type UserId = Brand<string, "UserId">;
export type OrganizationId = Brand<string, "OrganizationId">;
export type SessionId = Brand<string, "SessionId">;
export type CorrelationId = Brand<string, "CorrelationId">;

export function asUserId(id: string): UserId {
  return id as UserId;
}

export function asOrganizationId(id: string): OrganizationId {
  return id as OrganizationId;
}

export function asSessionId(id: string): SessionId {
  return id as SessionId;
}

export function asCorrelationId(id: string): CorrelationId {
  return id as CorrelationId;
}

// ─────────────────────────────────────────────────────────────────────────────
// User
// ─────────────────────────────────────────────────────────────────────────────

export type UserStatus = "active" | "inactive" | "suspended" | "pending_verification";

export type UserRole = "owner" | "admin" | "member" | "viewer";

export interface User {
  readonly id: UserId;
  readonly email: string;
  readonly name: string;
  readonly language: Language;
  readonly plan: Plan;
  readonly organizationId: OrganizationId | null;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly emailVerifiedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UserProfile extends Omit<User, "status"> {
  readonly avatarUrl: string | null;
  readonly timezone: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT Payload
// ─────────────────────────────────────────────────────────────────────────────

export interface JWTPayload {
  readonly sub: UserId;
  readonly email: string;
  readonly plan: Plan;
  readonly role: UserRole;
  readonly organizationId: OrganizationId | null;
  readonly language: Language;
  /** Issued at (Unix timestamp) */
  readonly iat: number;
  /** Expiration (Unix timestamp) */
  readonly exp: number;
  /** JWT ID for revocation */
  readonly jti: SessionId;
}

export interface RefreshTokenPayload {
  readonly sub: UserId;
  readonly jti: SessionId;
  readonly iat: number;
  readonly exp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Response envelope
// ─────────────────────────────────────────────────────────────────────────────

export interface ServiceResponse<T> {
  readonly success: true;
  readonly data: T;
  readonly meta?: ResponseMeta;
}

export interface ServiceErrorResponse {
  readonly success: false;
  readonly error: ServiceError;
}

export type ServiceResult<T> = ServiceResponse<T> | ServiceErrorResponse;

export interface ResponseMeta {
  readonly page?: number;
  readonly limit?: number;
  readonly total?: number;
  readonly hasMore?: boolean;
  readonly correlationId?: CorrelationId;
  readonly processingTimeMs?: number;
}

export interface PaginatedResponse<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly hasMore: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Error
// ─────────────────────────────────────────────────────────────────────────────

export type ErrorCode =
  // Auth errors
  | "AUTH_UNAUTHORIZED"
  | "AUTH_FORBIDDEN"
  | "AUTH_TOKEN_EXPIRED"
  | "AUTH_TOKEN_INVALID"
  | "AUTH_USER_NOT_FOUND"
  | "AUTH_EMAIL_ALREADY_EXISTS"
  | "AUTH_INVALID_CREDENTIALS"
  // Validation errors
  | "VALIDATION_ERROR"
  | "INVALID_INPUT"
  // Plan/limit errors
  | "PLAN_LIMIT_EXCEEDED"
  | "FEATURE_NOT_AVAILABLE"
  | "UPGRADE_REQUIRED"
  // Resource errors
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "CONFLICT"
  // Infrastructure errors
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "RATE_LIMIT_EXCEEDED"
  | "TIMEOUT"
  // Business errors
  | "PAYMENT_FAILED"
  | "INVOICE_ERROR"
  | "MARKETPLACE_ERROR"
  | "LOGISTICS_ERROR";

export interface ServiceError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly correlationId?: CorrelationId;
  readonly timestamp: string;
}

export function createServiceError(
  code: ErrorCode,
  message: string,
  details?: Readonly<Record<string, unknown>>,
  correlationId?: CorrelationId,
): ServiceError {
  return {
    code,
    message,
    ...(details !== undefined ? { details } : {}),
    ...(correlationId !== undefined ? { correlationId } : {}),
    timestamp: new Date().toISOString(),
  };
}

export function createSuccessResponse<T>(
  data: T,
  meta?: ResponseMeta,
): ServiceResponse<T> {
  return { success: true, data, ...(meta !== undefined ? { meta } : {}) };
}

export function createErrorResponse(
  error: ServiceError,
): ServiceErrorResponse {
  return { success: false, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// Health & Readiness
// ─────────────────────────────────────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export type DependencyStatus = "up" | "down" | "unknown";

export interface DependencyHealth {
  readonly name: string;
  readonly status: DependencyStatus;
  readonly latencyMs?: number;
  readonly error?: string;
}

export interface HealthCheckResponse {
  readonly status: HealthStatus;
  readonly service: ServiceName;
  readonly version: string;
  readonly timestamp: string;
  readonly uptime: number;
  readonly dependencies: readonly DependencyHealth[];
}

export interface ReadinessCheckResponse {
  readonly ready: boolean;
  readonly service: ServiceName;
  readonly timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace types
// ─────────────────────────────────────────────────────────────────────────────

export type MarketplaceName =
  | "allegro"
  | "amazon_pl"
  | "empik"
  | "ceneo"
  | "olx"
  | "kaufland"
  | "etsy"
  | "ebay";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned"
  | "refunded";

export type Currency = "PLN" | "EUR" | "USD";

export interface Money {
  readonly amount: number;
  readonly currency: Currency;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination & Filtering
// ─────────────────────────────────────────────────────────────────────────────

export interface PaginationParams {
  readonly page: number;
  readonly limit: number;
}

export interface SortParams<TField extends string = string> {
  readonly field: TField;
  readonly direction: "asc" | "desc";
}

export interface DateRangeFilter {
  readonly from: Date;
  readonly to: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────────────────────────────────────

export function isServiceError(value: unknown): value is ServiceErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    value.success === false
  );
}

export function isServiceSuccess<T>(
  value: ServiceResult<T>,
): value is ServiceResponse<T> {
  return value.success === true;
}

export function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && (PLANS as readonly string[]).includes(value);
}

export function isLanguage(value: unknown): value is Language {
  return (
    typeof value === "string" &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
  );
}

export function isServiceName(value: unknown): value is ServiceName {
  return (
    typeof value === "string" &&
    (SERVICE_NAMES as readonly string[]).includes(value)
  );
}
