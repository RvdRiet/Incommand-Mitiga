import { createHash } from "node:crypto";

import { compare, hash } from "bcryptjs";

/**
 * Password hashing + policy. bcrypt cost 12 (≈2024+ guidance); bump as hardware
 * improves. bcrypt silently truncates at 72 bytes, so we also cap policy length.
 */
const BCRYPT_COST = 12;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 72;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return compare(plain, passwordHash);
}

// A small, high-signal deny list — the full defence is length + a breach-check
// service in production (e.g. HaveIBeenPwned k-anonymity), wired via checkBreached.
const COMMON = new Set([
  "password", "passw0rd", "password123", "123456789012", "qwertyuiop12",
  "letmein12345", "welcome12345", "administrator", "incommand123", "changeme1234",
]);

export type PasswordCheck = { ok: true } | { ok: false; error: string };

/** Enforce the baseline policy. Returns a user-facing message on failure. */
export function checkPasswordPolicy(plain: string): PasswordCheck {
  if (typeof plain !== "string" || plain.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (plain.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, error: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.` };
  }
  // Require some variety: at least 3 of {lower, upper, digit, symbol}.
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(plain)).length;
  if (classes < 3) {
    return { ok: false, error: "Use at least three of: lowercase, uppercase, numbers, symbols." };
  }
  if (COMMON.has(plain.toLowerCase())) {
    return { ok: false, error: "That password is too common — choose a less predictable one." };
  }
  return { ok: true };
}

/**
 * Check a password against Have I Been Pwned using k-anonymity: only the first 5
 * chars of its SHA-1 are sent, never the password. Fail-open on network error or
 * when disabled (DISABLE_BREACH_CHECK=1) — the length/complexity policy still holds.
 */
export async function isPasswordBreached(plain: string): Promise<boolean> {
  if (process.env.DISABLE_BREACH_CHECK === "1") return false;
  try {
    const sha1 = createHash("sha1").update(plain).digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    for (const line of (await res.text()).split("\n")) {
      const [suf, count] = line.trim().split(":");
      if (suf === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    return false; // availability over strictness — never block sign-up on an HIBP outage
  }
}

/** Full acceptance check for a NEW password: policy (sync) then breach (network). */
export async function checkNewPassword(plain: string): Promise<PasswordCheck> {
  const policy = checkPasswordPolicy(plain);
  if (!policy.ok) return policy;
  if (await isPasswordBreached(plain)) {
    return { ok: false, error: "This password has appeared in a known data breach — choose a different one." };
  }
  return { ok: true };
}
