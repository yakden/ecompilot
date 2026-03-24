/**
 * Content Security Policy middleware for Fastify.
 *
 * Generates a unique nonce per request and attaches a strict CSP header.
 * The nonce is stored on `request.cspNonce` so templates / serializers can
 * inject it into inline `<script>` tags.
 */

import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

declare module "fastify" {
  interface FastifyRequest {
    /** Base64 nonce generated for this request's CSP header. */
    cspNonce: string;
  }
}

export interface CspOptions {
  /** Additional origins allowed in `connect-src`. */
  extraConnectSrc?: string[];
  /** Additional origins allowed in `img-src`. */
  extraImgSrc?: string[];
  /** Additional origins allowed in `frame-src` (overrides default `'none'`). */
  extraFrameSrc?: string[];
  /** Additional origins allowed in `script-src`. */
  extraScriptSrc?: string[];
  /** When `true`, the header is `Content-Security-Policy-Report-Only`. */
  reportOnly?: boolean;
  /** URI that receives CSP violation reports. */
  reportUri?: string;
  /** Nonce byte length (default 16 = 22-char base64 string). */
  nonceBytes?: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONNECT_SRC = [
  "'self'",
  "https://api.ecompilot.com",
  "https://*.stripe.com",
  "https://*.pinecone.io",
] as const;

const DEFAULT_IMG_SRC = [
  "'self'",
  "data:",
  "blob:",
  "https://*.amazonaws.com",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateNonce(bytes: number): string {
  return randomBytes(bytes).toString("base64");
}

function buildCspHeader(nonce: string, opts: CspOptions): string {
  const connectSrc = [
    ...DEFAULT_CONNECT_SRC,
    ...(opts.extraConnectSrc ?? []),
  ];

  const imgSrc = [
    ...DEFAULT_IMG_SRC,
    ...(opts.extraImgSrc ?? []),
  ];

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    ...(opts.extraScriptSrc ?? []),
  ];

  const frameSrc =
    opts.extraFrameSrc && opts.extraFrameSrc.length > 0
      ? opts.extraFrameSrc
      : ["'none'"];

  const directives: string[] = [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(" ")}`,
    `style-src 'self' 'unsafe-inline'`,
    `connect-src ${connectSrc.join(" ")}`,
    `img-src ${imgSrc.join(" ")}`,
    `frame-src ${frameSrc.join(" ")}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ];

  if (opts.reportUri) {
    directives.push(`report-uri ${opts.reportUri}`);
  }

  return directives.join("; ");
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers the CSP Fastify plugin.
 *
 * Usage:
 * ```ts
 * import { registerCsp } from "@ecompilot/shared-security/csp";
 * await registerCsp(app, { reportUri: "/csp-report" });
 * ```
 */
export async function registerCsp(
  fastify: FastifyInstance,
  opts: CspOptions = {},
): Promise<void> {
  const nonceBytes = opts.nonceBytes ?? 16;
  const headerName = opts.reportOnly
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";

  fastify.decorateRequest("cspNonce", "");

  fastify.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const nonce = generateNonce(nonceBytes);
      request.cspNonce = nonce;

      const header = buildCspHeader(nonce, opts);
      void reply.header(headerName, header);
      void reply.header("X-Content-Type-Options", "nosniff");
      void reply.header("X-Frame-Options", "DENY");
      void reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
      void reply.header(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=(self)",
      );
    },
  );
}

export { generateNonce, buildCspHeader };
