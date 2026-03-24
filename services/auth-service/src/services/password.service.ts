// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — auth-service: Password service (Argon2id)
// ─────────────────────────────────────────────────────────────────────────────

import argon2 from "argon2";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Argon2id configuration — OWASP recommended parameters
// memory: 64MB, iterations: 3, parallelism: 4, hashLength: 32
// ─────────────────────────────────────────────────────────────────────────────

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65_536,   // 64 MB
  timeCost: 3,          // iterations
  parallelism: 4,
  hashLength: 32,
};

// ─────────────────────────────────────────────────────────────────────────────
// Password strength schema
// min 8 chars, uppercase, lowercase, digit, special char
// ─────────────────────────────────────────────────────────────────────────────

export const PasswordStrengthSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/\d/, "Password must contain at least one digit")
  .regex(
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/,
    "Password must contain at least one special character",
  );

export type PasswordValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

export function validatePasswordStrength(password: string): PasswordValidationResult {
  const result = PasswordStrengthSchema.safeParse(password);
  if (result.success) {
    return { valid: true };
  }
  return {
    valid: false,
    errors: result.error.errors.map((e) => e.message),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hash & verify
// ─────────────────────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // argon2 throws on invalid hash format — treat as failed verification
    return false;
  }
}
