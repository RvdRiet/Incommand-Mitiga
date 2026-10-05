import { describe, expect, it } from "vitest";

import { checkPasswordPolicy, hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password policy", () => {
  it("rejects passwords under 12 chars", () => {
    const r = checkPasswordPolicy("Short1!");
    expect(r.ok).toBe(false);
  });

  it("requires at least 3 character classes", () => {
    // 12+ chars but only lowercase
    expect(checkPasswordPolicy("abcdefghijkl").ok).toBe(false);
  });

  it("rejects common passwords", () => {
    expect(checkPasswordPolicy("password123").ok).toBe(false);
  });

  it("accepts a strong password", () => {
    expect(checkPasswordPolicy("Resp0nder!Strong2026").ok).toBe(true);
  });
});

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("Resp0nder!Strong2026");
    expect(hash).toMatch(/^\$2[aby]\$12\$/); // bcrypt, cost 12
    expect(await verifyPassword("Resp0nder!Strong2026", hash)).toBe(true);
    expect(await verifyPassword("wrong-password-xxxx", hash)).toBe(false);
  });
});
