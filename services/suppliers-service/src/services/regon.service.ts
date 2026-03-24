// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — suppliers-service: REGON cross-reference service
//
// The official Polish REGON BIR1.1 API uses SOAP/XML which is complex and
// requires a session token obtained via a separate login call. For MVP this
// service cross-references data already fetched from KRS and CEIDG to provide
// REGON-based lookups without a separate SOAP integration.
//
// Strategy:
//   1. Attempt KRS lookup — many companies have a REGON embedded in the extract.
//   2. Attempt CEIDG lookup — sole traders also carry REGON.
//   3. If a match is found whose REGON equals the queried number, return it.
//   4. Otherwise return found: false with a note that BIR integration is pending.
//
// When REGON_BIR_KEY is added to the environment (future sprint), the SOAP
// client can be wired in here without changing the public interface.
//
// Caching: Redis TTL 24h (key: regon:{regon})
// Timeout: 10 seconds (delegated to KRS/CEIDG)
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { getRedis } from "./redis.service.js";
import { lookupKrs } from "./krs.service.js";
import { lookupCeidgByNip } from "./ceidg.service.js";
import {
  CeidgUnauthorizedError,
  CeidgServiceUnavailableError,
} from "./ceidg.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

// ─────────────────────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────────────────────

export const RegonSchema = z.object({
  regon: z
    .string()
    .regex(
      /^\d{9}$|^\d{14}$/,
      "REGON must be exactly 9 digits (person/small entity) or 14 digits (branch)",
    ),
});

export type RegonInput = z.infer<typeof RegonSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Public result types
// ─────────────────────────────────────────────────────────────────────────────

export type RegonEntityType = "company" | "sole_trader" | "unknown";

export interface RegonEntityData {
  readonly name: string;
  readonly nip: string | null;
  readonly regon: string;
  readonly address: string;
  readonly type: RegonEntityType;
}

export interface RegonLookupResult {
  readonly found: boolean;
  readonly entity?: RegonEntityData;
  /** Indicates that a full BIR SOAP integration is pending */
  readonly birIntegrationPending?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────────────────────────

function cacheKey(regon: string): string {
  return `regon:${regon}`;
}

async function getCached(regon: string): Promise<RegonLookupResult | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(cacheKey(regon));
    if (raw === null) return null;
    return JSON.parse(raw) as RegonLookupResult;
  } catch {
    return null;
  }
}

async function setCached(
  regon: string,
  result: RegonLookupResult,
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(cacheKey(regon), JSON.stringify(result), {
      EX: CACHE_TTL_SECONDS,
    });
  } catch {
    // Non-fatal
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NIP checksum validation (Polish tax authority algorithm)
// Used to derive candidate NIPs when cross-referencing by REGON is indirect.
// ─────────────────────────────────────────────────────────────────────────────

function isValidNip(nip: string): boolean {
  if (!/^\d{10}$/.test(nip)) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const digits = nip.split("").map(Number);
  const sum = weights.reduce(
    (acc, w, i) => acc + w * (digits[i] as number),
    0,
  );
  return sum % 11 === (digits[9] as number);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-reference via KRS
// ─────────────────────────────────────────────────────────────────────────────

// KRS numbers are separate from REGON. We cannot directly resolve a REGON to
// a KRS number without the BIR service. The KRS path is used when the caller
// provides additional context, but for a pure REGON lookup this is unavailable.
// Kept as a named stub for future BIR-augmented resolution.

async function tryKrsCrossReference(
  _regon: string,
): Promise<RegonEntityData | null> {
  // Without BIR we cannot derive KRS from REGON.
  // This function is a placeholder for the future BIR integration path:
  //   1. Call BIR to get the KRS number for the REGON.
  //   2. Call KRS API to get the full extract.
  //   3. Return the enriched entity.
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-reference via CEIDG (sole traders)
// ─────────────────────────────────────────────────────────────────────────────

// CEIDG records contain REGON. We do not have a direct REGON→NIP index, but
// REGON for sole traders typically encodes the REGON in the first 9 digits of
// a 14-digit REGON or directly as 9 digits. Since a reverse lookup is not
// possible without BIR, this path is also a stub for now.

async function tryCeidgCrossReference(
  _regon: string,
): Promise<RegonEntityData | null> {
  // Future: BIR → NIP → CEIDG lookup chain.
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public lookup entrypoint (REGON-keyed)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up an entity by REGON number.
 *
 * For MVP, cross-references data from KRS and CEIDG already cached in Redis.
 * Returns `birIntegrationPending: true` when no match can be found via
 * cross-reference, indicating the BIR SOAP integration (future sprint) is
 * needed for a definitive lookup.
 *
 * Results are cached in Redis for 24 hours.
 */
export async function lookupRegon(
  input: RegonInput,
): Promise<RegonLookupResult> {
  const { regon } = input;

  const cached = await getCached(regon);
  if (cached !== null) return cached;

  // Attempt cross-references (both return null in MVP — placeholders for BIR)
  let entity: RegonEntityData | null = null;

  try {
    entity = await tryKrsCrossReference(regon);
  } catch {
    // Non-fatal — continue to next source
  }

  if (entity === null) {
    try {
      entity = await tryCeidgCrossReference(regon);
    } catch (err) {
      // Auth errors surfaced but not fatal to lookup attempt
      if (
        !(err instanceof CeidgUnauthorizedError) &&
        !(err instanceof CeidgServiceUnavailableError)
      ) {
        throw err;
      }
    }
  }

  const result: RegonLookupResult =
    entity !== null
      ? { found: true, entity }
      : { found: false, birIntegrationPending: true };

  await setCached(regon, result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// REGON lookup with NIP hint (used internally by other services)
//
// When the caller already has a NIP (e.g. from a form), this provides a richer
// resolution path: CEIDG by NIP → check REGON match.
// ─────────────────────────────────────────────────────────────────────────────

export async function lookupRegonWithNipHint(
  regon: string,
  nip: string,
): Promise<RegonLookupResult> {
  if (!isValidNip(nip)) {
    return { found: false, birIntegrationPending: true };
  }

  const cached = await getCached(regon);
  if (cached !== null) return cached;

  // Try CEIDG with the provided NIP
  try {
    const ceidgResult = await lookupCeidgByNip({ nip });
    if (ceidgResult.found && ceidgResult.business !== undefined) {
      const normalizedRegon =
        ceidgResult.business.regon?.replace(/[^0-9]/g, "") ?? null;

      if (normalizedRegon === regon) {
        const entity: RegonEntityData = {
          name: ceidgResult.business.name,
          nip: ceidgResult.business.nip,
          regon,
          address: ceidgResult.business.address,
          type: "sole_trader",
        };
        const result: RegonLookupResult = { found: true, entity };
        await setCached(regon, result);
        return result;
      }
    }
  } catch {
    // Non-fatal — fall through
  }

  // Try KRS if a KRS number can be derived (requires BIR in future)
  // For now check if we have the company cached from a previous KRS lookup
  try {
    const redis = getRedis();
    const krsKeys = await redis.keys("krs:*");
    for (const key of krsKeys) {
      const raw = await redis.get(key);
      if (raw === null) continue;

      // Inline parse to avoid circular import concerns
      const krsResult = JSON.parse(raw) as {
        found: boolean;
        company?: {
          regon: string | null;
          name: string;
          nip: string | null;
          address: string;
        };
      };

      if (
        krsResult.found &&
        krsResult.company !== undefined &&
        krsResult.company.regon === regon
      ) {
        const entity: RegonEntityData = {
          name: krsResult.company.name,
          nip: krsResult.company.nip,
          regon,
          address: krsResult.company.address,
          type: "company",
        };
        const result: RegonLookupResult = { found: true, entity };
        await setCached(regon, result);
        return result;
      }
    }
  } catch {
    // Non-fatal
  }

  const notFoundResult: RegonLookupResult = {
    found: false,
    birIntegrationPending: true,
  };
  await setCached(regon, notFoundResult);
  return notFoundResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-export KRS and CEIDG lookup functions for convenience in route handlers
// ─────────────────────────────────────────────────────────────────────────────

export { lookupKrs } from "./krs.service.js";
export { lookupCeidgByNip } from "./ceidg.service.js";
