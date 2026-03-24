// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — calc-service
// REST Countries v3.1 integration
//
// Strategy: preload all ~250 countries into memory at startup.
// Individual lookups are O(1) map access — no Redis needed.
// Single HTTP call on cold-start; in-process Map forever after.
// ─────────────────────────────────────────────────────────────────────────────

import { createLogger } from "@ecompilot/shared-observability";
import { z } from "zod";

const logger = createLogger({ service: "calc-service", module: "countries" });

// ─── Constants ────────────────────────────────────────────────────────────────

const REST_COUNTRIES_BASE = "https://restcountries.com/v3.1";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 1;

// ─── REST Countries response schema ───────────────────────────────────────────

const RestCountrySchema = z.object({
  cca2: z.string().length(2),
  name: z.object({
    common: z.string(),
    official: z.string(),
  }),
  flags: z.object({
    png: z.string().optional(),
    svg: z.string().optional(),
  }).optional(),
  currencies: z.record(
    z.string(),
    z.object({
      name: z.string().optional(),
      symbol: z.string().optional(),
    }),
  ).optional(),
  languages: z.record(z.string(), z.string()).optional(),
  capital: z.array(z.string()).optional(),
  population: z.number().optional(),
  region: z.string().optional(),
});

const RestCountriesAllResponseSchema = z.array(RestCountrySchema);

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CountryDetail {
  readonly code: string;
  readonly name: string;
  readonly officialName: string;
  readonly flag: string | null;
  readonly currency: string | null;
  readonly currencySymbol: string | null;
  readonly language: string | null;
  readonly capital: string | null;
  readonly region: string | null;
  readonly population: number | null;
}

export interface CountrySummary {
  readonly code: string;
  readonly name: string;
  readonly flag: string | null;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

const countryMap = new Map<string, CountryDetail>();
let preloadComplete = false;
let preloadPromise: Promise<void> | null = null;

// ─── HTTP fetch with timeout & retry ──────────────────────────────────────────

async function fetchWithRetry(url: string, attempt = 0): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: controller.signal,
    });

    if (response.status >= 500 && attempt < MAX_RETRIES) {
      logger.warn({ status: response.status, attempt }, "REST Countries 5xx — retrying");
      return fetchWithRetry(url, attempt + 1);
    }

    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapCountry(raw: z.infer<typeof RestCountrySchema>): CountryDetail {
  const currencyEntries = Object.entries(raw.currencies ?? {});
  const firstCurrency = currencyEntries[0];
  const languageValues = Object.values(raw.languages ?? {});

  return {
    code: raw.cca2.toUpperCase(),
    name: raw.name.common,
    officialName: raw.name.official,
    flag: raw.flags?.svg ?? raw.flags?.png ?? null,
    currency: firstCurrency?.[1].name ?? null,
    currencySymbol: firstCurrency?.[1].symbol ?? null,
    language: languageValues[0] ?? null,
    capital: raw.capital?.[0] ?? null,
    region: raw.region ?? null,
    population: raw.population ?? null,
  };
}

// ─── Preloader ────────────────────────────────────────────────────────────────

async function doPreload(): Promise<void> {
  const url = `${REST_COUNTRIES_BASE}/all?fields=cca2,name,flags,currencies,languages,capital,population,region`;

  logger.info("Preloading REST Countries data");

  const response = await fetchWithRetry(url);

  if (!response.ok) {
    throw new Error(`REST Countries preload failed: HTTP ${response.status}`);
  }

  const raw: unknown = await response.json();
  const parsed = RestCountriesAllResponseSchema.safeParse(raw);

  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues }, "Unexpected REST Countries schema");
    throw new Error("Invalid response from REST Countries API");
  }

  for (const country of parsed.data) {
    const mapped = mapCountry(country);
    countryMap.set(mapped.code, mapped);
  }

  preloadComplete = true;
  logger.info({ count: countryMap.size }, "REST Countries data preloaded");
}

/**
 * Trigger the preload of all countries into memory.
 * Safe to call multiple times — runs only once.
 */
export async function preloadCountries(): Promise<void> {
  if (preloadComplete) return;
  if (preloadPromise !== null) {
    await preloadPromise;
    return;
  }

  preloadPromise = doPreload().catch((err: unknown) => {
    logger.error({ err }, "REST Countries preload failed");
    preloadPromise = null;
    throw err;
  });

  await preloadPromise;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get full details for a single country by ISO 3166-1 alpha-2 code.
 * Requires preloadCountries() to have been called at startup.
 */
export function getCountryByCode(code: string): CountryDetail | null {
  return countryMap.get(code.toUpperCase()) ?? null;
}

/**
 * List all countries as lightweight summaries.
 * Returns a stable sorted array (by common name).
 */
export function listCountries(): readonly CountrySummary[] {
  const entries = Array.from(countryMap.values());
  entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
  return entries.map((c) => ({
    code: c.code,
    name: c.name,
    flag: c.flag,
  }));
}

/**
 * Fetch a single country directly from the REST Countries API (bypasses cache).
 * Used as a fallback if preload has not yet completed.
 */
export async function fetchCountryByCode(code: string): Promise<CountryDetail | null> {
  const upper = code.toUpperCase();

  // Check in-memory store first
  const cached = countryMap.get(upper);
  if (cached !== undefined) return cached;

  const url = `${REST_COUNTRIES_BASE}/alpha/${encodeURIComponent(upper)}`;

  const response = await fetchWithRetry(url);

  if (response.status === 404) return null;

  if (!response.ok) {
    throw new Error(`REST Countries lookup failed: HTTP ${response.status}`);
  }

  const raw: unknown = await response.json();

  // The /alpha endpoint returns an array
  const listParsed = RestCountriesAllResponseSchema.safeParse(raw);
  if (listParsed.success && listParsed.data.length > 0) {
    const first = listParsed.data[0];
    if (first === undefined) return null;
    const mapped = mapCountry(first);
    countryMap.set(mapped.code, mapped);
    return mapped;
  }

  // Some versions return a single object
  const singleParsed = RestCountrySchema.safeParse(raw);
  if (singleParsed.success) {
    const mapped = mapCountry(singleParsed.data);
    countryMap.set(mapped.code, mapped);
    return mapped;
  }

  logger.warn({ code, issues: singleParsed.error.issues }, "Unexpected REST Countries /alpha schema");
  return null;
}
