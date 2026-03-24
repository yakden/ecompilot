// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — suppliers-service: KRS Open API service
//
// Endpoint: GET https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/{krsNumber}?rejestr=P&format=json
// No API key required.
// Returns: full company extract — name, NIP, REGON, address, board members, capital.
//
// Caching: Redis TTL 24h (key: krs:{krsNumber})
// Timeout: 10 seconds
// Retry: exponential backoff on 5xx (3 attempts)
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { getRedis } from "./redis.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const KRS_BASE_URL = "https://api-krs.ms.gov.pl/api/krs/OdpisAktualny";
const USER_AGENT = "EcomPilot/1.0 (ecompilot.pl; contact@ecompilot.pl)";
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────────────────────

export const KrsNumberSchema = z.object({
  krsNumber: z
    .string()
    .regex(/^\d{10}$/, "KRS number must be exactly 10 digits"),
});

export type KrsNumberInput = z.infer<typeof KrsNumberSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// KRS API response shape (partial — only the fields we use)
// ─────────────────────────────────────────────────────────────────────────────

interface KrsRawAdres {
  ulica?: string | null;
  nrDomu?: string | null;
  nrLokalu?: string | null;
  miejscowosc?: string | null;
  kodPocztowy?: string | null;
  kraj?: string | null;
}

interface KrsRawOsobaFizyczna {
  imiona?: string | null;
  nazwisko?: string | null;
  funkcja?: string | null;
}

interface KrsRawResponse {
  odpis?: {
    dane?: {
      dzial1?: {
        danePodmiotu?: {
          nazwa?: string | null;
          nip?: string | null;
          regon?: string | null;
          dataWpisu?: string | null;
        };
        siedzibaIAdresZarzadu?: {
          adres?: KrsRawAdres;
        };
      };
      dzial2?: {
        organPrzedstawicielski?: {
          osobyFizyczne?: KrsRawOsobaFizyczna[];
        };
        kapital?: {
          wysokoscKapitaluZakladowego?: number | null;
          waluta?: string | null;
        };
      };
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public result type
// ─────────────────────────────────────────────────────────────────────────────

export interface KrsBoardMember {
  readonly name: string;
  readonly role: string;
}

export interface KrsCompanyData {
  readonly name: string;
  readonly nip: string | null;
  readonly regon: string | null;
  readonly address: string;
  readonly capital: number | null;
  readonly capitalCurrency: string | null;
  readonly boardMembers: readonly KrsBoardMember[];
  readonly registrationDate: string | null;
}

export interface KrsLookupResult {
  readonly found: boolean;
  readonly company?: KrsCompanyData;
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom errors
// ─────────────────────────────────────────────────────────────────────────────

export class KrsRetryableError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "KrsRetryableError";
  }
}

export class KrsServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KrsServiceUnavailableError";
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

      const isRetryable =
        err instanceof KrsRetryableError ||
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

function formatAddress(adres: KrsRawAdres | undefined): string {
  if (adres === undefined) return "";

  const parts: string[] = [];

  const streetLine =
    [adres.ulica, adres.nrDomu, adres.nrLokalu ? `/${adres.nrLokalu}` : ""]
      .filter(Boolean)
      .join(" ")
      .trim();

  if (streetLine.length > 0) parts.push(streetLine);
  if (adres.kodPocztowy) parts.push(adres.kodPocztowy);
  if (adres.miejscowosc) parts.push(adres.miejscowosc);
  if (adres.kraj && adres.kraj !== "POLSKA") parts.push(adres.kraj);

  return parts.join(", ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────────────────────────

function cacheKey(krsNumber: string): string {
  return `krs:${krsNumber}`;
}

async function getCached(krsNumber: string): Promise<KrsLookupResult | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(cacheKey(krsNumber));
    if (raw === null) return null;
    return JSON.parse(raw) as KrsLookupResult;
  } catch {
    return null;
  }
}

async function setCached(
  krsNumber: string,
  result: KrsLookupResult,
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(cacheKey(krsNumber), JSON.stringify(result), {
      EX: CACHE_TTL_SECONDS,
    });
  } catch {
    // Non-fatal
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core API call
// ─────────────────────────────────────────────────────────────────────────────

async function callKrsApi(krsNumber: string): Promise<KrsLookupResult> {
  const url = `${KRS_BASE_URL}/${krsNumber}?rejestr=P&format=json`;

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
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new KrsServiceUnavailableError(
        "KRS API request timed out after 10 seconds",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 404) {
    return { found: false };
  }

  if (response.status >= 500) {
    throw new KrsRetryableError(
      `KRS API server error: ${response.status.toString()}`,
      response.status,
    );
  }

  if (!response.ok) {
    throw new Error(
      `KRS API returned ${response.status.toString()}: ${response.statusText}`,
    );
  }

  const raw = (await response.json()) as KrsRawResponse;
  const dane = raw?.odpis?.dane;

  if (dane === undefined || dane === null) {
    return { found: false };
  }

  const podmiot = dane.dzial1?.danePodmiotu;
  const adres = dane.dzial1?.siedzibaIAdresZarzadu?.adres;
  const osoby = dane.dzial2?.organPrzedstawicielski?.osobyFizyczne ?? [];
  const kapital = dane.dzial2?.kapital;

  const boardMembers: KrsBoardMember[] = osoby
    .filter((o) => o.nazwisko)
    .map((o) => ({
      name: [o.imiona, o.nazwisko].filter(Boolean).join(" ").trim(),
      role: o.funkcja?.trim() ?? "Nieznana funkcja",
    }));

  const company: KrsCompanyData = {
    name: podmiot?.nazwa?.trim() ?? "",
    nip: podmiot?.nip?.replace(/[^0-9]/g, "") ?? null,
    regon: podmiot?.regon?.replace(/[^0-9]/g, "") ?? null,
    address: formatAddress(adres),
    capital:
      kapital?.wysokoscKapitaluZakladowego !== undefined &&
      kapital?.wysokoscKapitaluZakladowego !== null
        ? kapital.wysokoscKapitaluZakladowego
        : null,
    capitalCurrency: kapital?.waluta ?? null,
    boardMembers,
    registrationDate: podmiot?.dataWpisu ?? null,
  };

  return { found: true, company };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up a company in the Polish KRS (National Court Register) by KRS number.
 *
 * Results cached in Redis for 24 hours.
 * 5xx responses are retried up to MAX_RETRIES times with exponential backoff.
 */
export async function lookupKrs(input: KrsNumberInput): Promise<KrsLookupResult> {
  const { krsNumber } = input;

  const cached = await getCached(krsNumber);
  if (cached !== null) return cached;

  const result = await withRetry(
    () => callKrsApi(krsNumber),
    MAX_RETRIES,
    RETRY_BASE_DELAY_MS,
  );

  await setCached(krsNumber, result);
  return result;
}
