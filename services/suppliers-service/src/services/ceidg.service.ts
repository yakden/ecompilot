// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — suppliers-service: CEIDG API v2 service
//
// Endpoint: GET https://dane.biznes.gov.pl/api/ceidg/v2/firma?nip={nip}
// Auth: Bearer token from CEIDG_TOKEN env var (free registration at dane.biznes.gov.pl)
// Returns: sole-trader / individual business data — name, NIP, REGON, address,
//          PKD codes, status, dates.
//
// Caching: Redis TTL 24h (key: ceidg:nip:{nip})
// Timeout: 10 seconds
// Retry: exponential backoff on 5xx (3 attempts)
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { getRedis } from "./redis.service.js";
import { env } from "../config/env.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CEIDG_BASE_URL = "https://dane.biznes.gov.pl/api/ceidg/v2/firma";
const USER_AGENT = "EcomPilot/1.0 (ecompilot.pl; contact@ecompilot.pl)";
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────────────────────

export const NipSchema = z.object({
  nip: z
    .string()
    .regex(/^\d{10}$/, "NIP must be exactly 10 digits"),
});

export type NipInput = z.infer<typeof NipSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// CEIDG API raw response shape (partial)
// ─────────────────────────────────────────────────────────────────────────────

interface CeidgRawAdres {
  ulica?: string | null;
  budynek?: string | null;
  lokal?: string | null;
  miasto?: string | null;
  kod?: string | null;
  kraj?: string | null;
}

interface CeidgRawPkd {
  kod?: string | null;
  nazwa?: string | null;
  przewazajace?: boolean;
}

interface CeidgRawFirma {
  firma?: string | null;
  imie?: string | null;
  nazwisko?: string | null;
  nip?: string | null;
  regon?: string | null;
  status?: string | null;
  dataDzialalnosciOd?: string | null;
  dataDzialalnosciDo?: string | null;
  dataZawieszenia?: string | null;
  adresGlownegoMiejscaWykonywaniaDzialalnosci?: CeidgRawAdres;
  adresDzialalnosciGlowne?: CeidgRawAdres;
  pkd?: CeidgRawPkd[];
}

interface CeidgApiResponse {
  firma?: CeidgRawFirma | null;
  firmy?: CeidgRawFirma[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public result types
// ─────────────────────────────────────────────────────────────────────────────

export interface CeidgPkdCode {
  readonly code: string;
  readonly name: string;
  readonly isPrimary: boolean;
}

export interface CeidgBusinessData {
  readonly name: string;
  readonly nip: string;
  readonly regon: string | null;
  readonly address: string;
  readonly pkdCodes: readonly CeidgPkdCode[];
  readonly status: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly suspensionDate: string | null;
}

export interface CeidgLookupResult {
  readonly found: boolean;
  readonly business?: CeidgBusinessData;
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom errors
// ─────────────────────────────────────────────────────────────────────────────

export class CeidgRetryableError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "CeidgRetryableError";
  }
}

export class CeidgUnauthorizedError extends Error {
  constructor() {
    super(
      "CEIDG API authentication failed. Check CEIDG_TOKEN environment variable.",
    );
    this.name = "CeidgUnauthorizedError";
  }
}

export class CeidgServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CeidgServiceUnavailableError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry helper
// ─────────────────────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  baseDelayMs: number,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Do not retry auth errors
      if (err instanceof CeidgUnauthorizedError) throw err;

      const isRetryable =
        err instanceof CeidgRetryableError ||
        (err instanceof Error &&
          (err.message.includes("fetch failed") ||
            err.message.includes("ECONNRESET") ||
            err.message.includes("ETIMEDOUT")));

      if (!isRetryable || attempt === maxAttempts) {
        throw err;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ─────────────────────────────────────────────────────────────────────────────
// Address formatter
// ─────────────────────────────────────────────────────────────────────────────

function formatAddress(adres: CeidgRawAdres | undefined | null): string {
  if (adres === undefined || adres === null) return "";

  const parts: string[] = [];

  const streetLine = [
    adres.ulica,
    adres.budynek,
    adres.lokal ? `/${adres.lokal}` : null,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (streetLine.length > 0) parts.push(streetLine);
  if (adres.kod) parts.push(adres.kod);
  if (adres.miasto) parts.push(adres.miasto);
  if (adres.kraj && adres.kraj !== "Polska" && adres.kraj !== "PL")
    parts.push(adres.kraj);

  return parts.join(", ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Transform raw firma to typed result
// ─────────────────────────────────────────────────────────────────────────────

function transformFirma(firma: CeidgRawFirma): CeidgBusinessData {
  const displayName =
    firma.firma?.trim() ??
    [firma.imie, firma.nazwisko].filter(Boolean).join(" ").trim() ??
    "";

  const adres =
    firma.adresGlownegoMiejscaWykonywaniaDzialalnosci ??
    firma.adresDzialalnosciGlowne;

  const pkdCodes: CeidgPkdCode[] = (firma.pkd ?? [])
    .filter((p): p is CeidgRawPkd & { kod: string } => Boolean(p.kod))
    .map((p) => ({
      code: p.kod,
      name: p.nazwa?.trim() ?? "",
      isPrimary: p.przewazajace === true,
    }));

  return {
    name: displayName,
    nip: firma.nip?.replace(/[^0-9]/g, "") ?? "",
    regon: firma.regon?.replace(/[^0-9]/g, "") ?? null,
    address: formatAddress(adres),
    pkdCodes,
    status: firma.status?.trim() ?? "UNKNOWN",
    startDate: firma.dataDzialalnosciOd ?? null,
    endDate: firma.dataDzialalnosciDo ?? null,
    suspensionDate: firma.dataZawieszenia ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────────────────────────

function cacheKey(nip: string): string {
  return `ceidg:nip:${nip}`;
}

async function getCached(nip: string): Promise<CeidgLookupResult | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(cacheKey(nip));
    if (raw === null) return null;
    return JSON.parse(raw) as CeidgLookupResult;
  } catch {
    return null;
  }
}

async function setCached(
  nip: string,
  result: CeidgLookupResult,
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(cacheKey(nip), JSON.stringify(result), {
      EX: CACHE_TTL_SECONDS,
    });
  } catch {
    // Non-fatal
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core API call
// ─────────────────────────────────────────────────────────────────────────────

async function callCeidgApi(nip: string): Promise<CeidgLookupResult> {
  const token = env.CEIDG_TOKEN;
  if (!token) {
    throw new CeidgUnauthorizedError();
  }

  const url = `${CEIDG_BASE_URL}?nip=${encodeURIComponent(nip)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new CeidgServiceUnavailableError(
        "CEIDG API request timed out after 10 seconds",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401 || response.status === 403) {
    throw new CeidgUnauthorizedError();
  }

  if (response.status === 404) {
    return { found: false };
  }

  if (response.status >= 500) {
    throw new CeidgRetryableError(
      `CEIDG API server error: ${response.status.toString()}`,
      response.status,
    );
  }

  if (!response.ok) {
    throw new Error(
      `CEIDG API returned ${response.status.toString()}: ${response.statusText}`,
    );
  }

  const data = (await response.json()) as CeidgApiResponse;

  // API may return a single 'firma' object or a 'firmy' array
  const firma =
    data.firma ??
    (Array.isArray(data.firmy) && data.firmy.length > 0
      ? data.firmy[0]
      : null);

  if (firma === null || firma === undefined) {
    return { found: false };
  }

  return {
    found: true,
    business: transformFirma(firma),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up a Polish sole trader or small business by NIP in CEIDG.
 *
 * Results cached in Redis for 24 hours.
 * Requires CEIDG_TOKEN environment variable (Bearer token from dane.biznes.gov.pl).
 */
export async function lookupCeidgByNip(
  input: NipInput,
): Promise<CeidgLookupResult> {
  const { nip } = input;

  const cached = await getCached(nip);
  if (cached !== null) return cached;

  const result = await withRetry(
    () => callCeidgApi(nip),
    MAX_RETRIES,
    RETRY_BASE_DELAY_MS,
  );

  await setCached(nip, result);
  return result;
}
