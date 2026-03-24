// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — auth-service: Token service (RS256 JWT + refresh tokens)
// ─────────────────────────────────────────────────────────────────────────────

import { SignJWT, jwtVerify, importPKCS8, importSPKI } from "jose";
import { createHash, randomBytes } from "node:crypto";
import type { KeyLike } from "jose";
import { env, decodePemKey } from "../config/env.js";
import type { Language, Plan } from "@ecompilot/shared-types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AccessTokenPayload {
  readonly sub: string;
  readonly email: string;
  readonly plan: Plan;
  readonly language: Language;
  readonly iss: string;
  readonly aud: string;
  readonly kid: string;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
}

export interface RefreshTokenPair {
  /** Raw token — send to client */
  readonly raw: string;
  /** SHA-256 hash — store in DB */
  readonly hash: string;
}

export interface TokenUserPayload {
  readonly id: string;
  readonly email: string;
  readonly plan: Plan;
  readonly language: Language;
}

const ISSUER = "api.ecompilot.com";
const AUDIENCE = "ecompilot.com";
const KEY_ID = "ecompilot-2025-01";
const ALGORITHM = "RS256";

// ─────────────────────────────────────────────────────────────────────────────
// Key cache — loaded once
// ─────────────────────────────────────────────────────────────────────────────

let _privateKey: KeyLike | null = null;
let _publicKey: KeyLike | null = null;

async function getPrivateKey(): Promise<KeyLike> {
  if (_privateKey === null) {
    const pem = decodePemKey(env.JWT_PRIVATE_KEY);
    _privateKey = await importPKCS8(pem, ALGORITHM);
  }
  return _privateKey;
}

async function getPublicKey(): Promise<KeyLike> {
  if (_publicKey === null) {
    const pem = decodePemKey(env.JWT_PUBLIC_KEY);
    _publicKey = await importSPKI(pem, ALGORITHM);
  }
  return _publicKey;
}

// ─────────────────────────────────────────────────────────────────────────────
// TTL parsing — "15m", "30d", "1h" → seconds
// ─────────────────────────────────────────────────────────────────────────────

function parseTtlToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (match === null) {
    throw new Error(`Invalid TTL format: "${ttl}". Expected format: 15m, 1h, 30d`);
  }
  const value = parseInt(match[1] ?? "0", 10);
  const unit = match[2];
  switch (unit) {
    case "s": return value;
    case "m": return value * 60;
    case "h": return value * 3600;
    case "d": return value * 86400;
    default: throw new Error(`Unknown TTL unit: ${unit}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Access token
// ─────────────────────────────────────────────────────────────────────────────

export async function generateAccessToken(user: TokenUserPayload): Promise<string> {
  const privateKey = await getPrivateKey();
  const ttlSeconds = parseTtlToSeconds(env.JWT_ACCESS_TTL);

  return new SignJWT({
    email: user.email,
    plan: user.plan,
    language: user.language,
  })
    .setProtectedHeader({ alg: ALGORITHM, kid: KEY_ID })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .setJti(crypto.randomUUID())
    .sign(privateKey);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const publicKey = await getPublicKey();

  const { payload } = await jwtVerify(token, publicKey, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: [ALGORITHM],
  });

  return payload as unknown as AccessTokenPayload;
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh token — opaque 64-byte random value, SHA-256 stored in DB
// ─────────────────────────────────────────────────────────────────────────────

export function generateRefreshToken(): RefreshTokenPair {
  const raw = randomBytes(64).toString("base64url");
  const hash = hashRefreshToken(raw);
  return { raw, hash };
}

export function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh token expiry
// ─────────────────────────────────────────────────────────────────────────────

export function getRefreshTokenExpiry(): Date {
  const ttlSeconds = parseTtlToSeconds(env.JWT_REFRESH_TTL);
  return new Date(Date.now() + ttlSeconds * 1000);
}
