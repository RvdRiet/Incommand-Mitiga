import { describe, expect, it } from "vitest";

import { generateToken, hashToken, tokensMatch } from "@/lib/auth/tokens";

describe("auth tokens", () => {
  it("generates unique, high-entropy tokens", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40); // 256 bits base64url
  });

  it("hashes deterministically and never stores the raw token", () => {
    const raw = generateToken();
    const h1 = hashToken(raw);
    const h2 = hashToken(raw);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(raw);
    expect(h1).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it("constant-time compare matches only equal hashes", () => {
    const raw = generateToken();
    expect(tokensMatch(hashToken(raw), hashToken(raw))).toBe(true);
    expect(tokensMatch(hashToken(raw), hashToken(generateToken()))).toBe(false);
  });
});
