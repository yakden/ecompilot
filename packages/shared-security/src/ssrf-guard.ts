/**
 * SSRF (Server-Side Request Forgery) protection.
 *
 * Prevents application-level requests from targeting internal / private
 * network addresses.  Use `validateUrl()` before any outbound HTTP
 * fetch that includes user-controlled URLs.
 */

import { lookup } from "node:dns/promises";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SsrfValidationResult {
  safe: boolean;
  /** Resolved IP address (when safe). */
  resolvedIp?: string;
  /** Human-readable reason when the URL is blocked. */
  reason?: string;
}

export interface SsrfGuardOptions {
  /** Additional CIDR ranges or IPs to block. */
  extraBlockedRanges?: string[];
  /** Hostnames that are always allowed (bypass DNS check). */
  allowedHosts?: string[];
  /** Allowed URL schemes (default: ["https"]). */
  allowedSchemes?: string[];
  /** DNS resolution timeout in ms (default: 3000). */
  dnsTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Private IP detection
// ---------------------------------------------------------------------------

/**
 * Parse an IPv4 address into a 32-bit integer.
 * Returns `null` for invalid addresses.
 */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    result = (result << 8) | octet;
  }
  // Convert to unsigned 32-bit
  return result >>> 0;
}

/**
 * Check if an IPv4 integer falls within a CIDR range.
 */
function isInCidr(ipInt: number, cidr: string): boolean {
  const [base, prefixStr] = cidr.split("/") as [string, string];
  const prefix = Number(prefixStr);
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/**
 * Private / reserved IPv4 CIDR ranges that MUST be blocked.
 */
const BLOCKED_IPV4_CIDRS = [
  "0.0.0.0/8",         // "This" network
  "10.0.0.0/8",        // Private (RFC 1918)
  "100.64.0.0/10",     // Carrier-grade NAT (RFC 6598)
  "127.0.0.0/8",       // Loopback
  "169.254.0.0/16",    // Link-local (APIPA / AWS metadata)
  "172.16.0.0/12",     // Private (RFC 1918)
  "192.0.0.0/24",      // IETF protocol assignments
  "192.0.2.0/24",      // TEST-NET-1
  "192.88.99.0/24",    // 6to4 relay anycast (deprecated)
  "192.168.0.0/16",    // Private (RFC 1918)
  "198.18.0.0/15",     // Benchmarking
  "198.51.100.0/24",   // TEST-NET-2
  "203.0.113.0/24",    // TEST-NET-3
  "224.0.0.0/4",       // Multicast
  "240.0.0.0/4",       // Reserved
  "255.255.255.255/32", // Broadcast
];

/**
 * IPv6 addresses / prefixes that represent private / loopback addresses.
 */
const BLOCKED_IPV6_PREFIXES = [
  "::1",         // loopback
  "fc",          // unique local (fc00::/7)
  "fd",          // unique local (fc00::/7)
  "fe80",        // link-local
  "::ffff:127.", // IPv4-mapped loopback
  "::ffff:10.",  // IPv4-mapped 10.x
  "::ffff:172.", // IPv4-mapped 172.x (further checked below)
  "::ffff:192.", // IPv4-mapped 192.x (further checked below)
  "::ffff:169.", // IPv4-mapped link-local
  "::ffff:0.",   // IPv4-mapped 0.x
];

/**
 * Determine whether an IP address is private / reserved.
 *
 * @param ip  IPv4 or IPv6 address string
 * @returns `true` if the address belongs to a private / reserved range
 */
export function isPrivateIP(ip: string): boolean {
  const trimmed = ip.trim();

  // --- IPv4 ---
  const ipInt = ipv4ToInt(trimmed);
  if (ipInt !== null) {
    for (const cidr of BLOCKED_IPV4_CIDRS) {
      if (isInCidr(ipInt, cidr)) return true;
    }
    return false;
  }

  // --- IPv6 ---
  const lower = trimmed.toLowerCase();

  // Direct loopback
  if (lower === "::1" || lower === "::") return true;

  // Check prefixes
  for (const prefix of BLOCKED_IPV6_PREFIXES) {
    if (lower.startsWith(prefix.toLowerCase())) {
      // For IPv4-mapped addresses, extract the IPv4 portion and re-check
      if (lower.startsWith("::ffff:")) {
        const v4Part = lower.slice(7);
        const v4Int = ipv4ToInt(v4Part);
        if (v4Int !== null) {
          for (const cidr of BLOCKED_IPV4_CIDRS) {
            if (isInCidr(v4Int, cidr)) return true;
          }
          return false;
        }
      }
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

/**
 * Validate that a URL resolves to a public (non-private) IP address.
 *
 * This function performs DNS resolution and checks the result against
 * all known private / reserved ranges.  Use it before making any
 * outbound HTTP request with user-controlled URLs.
 *
 * **Important:** Call this as close to the fetch as possible to
 * minimise the TOCTOU (time-of-check-time-of-use) window.
 *
 * @param url   The URL to validate
 * @param opts  Optional guard configuration
 * @returns     Validation result with resolved IP when safe
 */
export async function validateUrl(
  url: string,
  opts: SsrfGuardOptions = {},
): Promise<SsrfValidationResult> {
  const {
    allowedHosts = [],
    allowedSchemes = ["https"],
    dnsTimeoutMs = 3_000,
    extraBlockedRanges = [],
  } = opts;

  // Parse URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: "Invalid URL" };
  }

  // Scheme check
  const scheme = parsed.protocol.replace(":", "");
  if (!allowedSchemes.includes(scheme)) {
    return {
      safe: false,
      reason: `Scheme "${scheme}" is not allowed. Allowed: ${allowedSchemes.join(", ")}`,
    };
  }

  // Block URLs with credentials
  if (parsed.username || parsed.password) {
    return { safe: false, reason: "URLs with embedded credentials are not allowed" };
  }

  const hostname = parsed.hostname;

  // Allow-listed hosts bypass DNS checks
  if (allowedHosts.includes(hostname)) {
    return { safe: true };
  }

  // Block obvious private hostnames
  if (
    hostname === "localhost" ||
    hostname === "metadata.google.internal" ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local")
  ) {
    return { safe: false, reason: `Hostname "${hostname}" resolves to a private network` };
  }

  // If the hostname is already an IP address, validate directly
  const directIpInt = ipv4ToInt(hostname);
  if (directIpInt !== null || hostname === "::1" || hostname.startsWith("::")) {
    if (isPrivateIP(hostname)) {
      return { safe: false, reason: `IP address "${hostname}" is in a private/reserved range` };
    }
    for (const range of extraBlockedRanges) {
      if (directIpInt !== null && isInCidr(directIpInt, range)) {
        return { safe: false, reason: `IP address "${hostname}" is in a blocked range` };
      }
    }
    return { safe: true, resolvedIp: hostname };
  }

  // DNS resolution with timeout
  let resolvedIp: string;
  try {
    const result = await Promise.race([
      lookup(hostname),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DNS timeout")), dnsTimeoutMs),
      ),
    ]);
    resolvedIp = result.address;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown DNS error";
    return { safe: false, reason: `DNS resolution failed: ${message}` };
  }

  // Check resolved IP
  if (isPrivateIP(resolvedIp)) {
    return {
      safe: false,
      reason: `Hostname "${hostname}" resolves to private IP "${resolvedIp}"`,
    };
  }

  // Check extra blocked ranges
  const resolvedInt = ipv4ToInt(resolvedIp);
  if (resolvedInt !== null) {
    for (const range of extraBlockedRanges) {
      if (isInCidr(resolvedInt, range)) {
        return {
          safe: false,
          reason: `Hostname "${hostname}" resolves to blocked IP "${resolvedIp}"`,
        };
      }
    }
  }

  return { safe: true, resolvedIp };
}
