/**
 * @ecompilot/shared-security
 *
 * Security primitives for the EcomPilot PL platform.
 */

export {
  registerCsp,
  generateNonce,
  buildCspHeader,
  type CspOptions,
} from "./csp.js";

export {
  encrypt,
  decrypt,
  generateEncryptionKey,
  keysEqual,
  reEncrypt,
  type EncryptionResult,
} from "./encryption.js";

export {
  sanitizeHtml,
  sanitizeMarkdown,
  escapeForLog,
} from "./sanitize.js";

export {
  createRateLimiter,
  MemoryStore,
  type RateLimitConfig,
  type RateLimitResult,
  type RateLimitAlgorithm,
  type RedisLike,
} from "./rate-limiter.js";

export {
  isPrivateIP,
  validateUrl,
  type SsrfValidationResult,
  type SsrfGuardOptions,
} from "./ssrf-guard.js";
