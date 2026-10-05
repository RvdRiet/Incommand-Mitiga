import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * One-time link tokens (invites, password resets, email verification). The raw
 * token goes only in the emailed URL; we persist just its SHA-256 hash, so a
 * database read can never reveal a usable token.
 */

/** A URL-safe, high-entropy token (256 bits). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hash a raw token for storage / lookup. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Constant-time compare of two hex hashes (avoids timing leaks on lookup). */
export function tokensMatch(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Default lifetimes. Invites are longer-lived than resets. */
export const TOKEN_TTL = {
  invite: 7 * 24 * 60 * 60 * 1000, // 7 days
  password_reset: 60 * 60 * 1000, // 1 hour
  email_verify: 24 * 60 * 60 * 1000, // 1 day
} as const;
