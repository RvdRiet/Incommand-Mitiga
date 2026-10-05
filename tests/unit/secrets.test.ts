import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "@/lib/auth/secrets";

describe("secret encryption (TOTP at rest)", () => {
  it("round-trips a secret and never stores it in clear", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const blob = encryptSecret(secret);
    expect(blob).not.toContain(secret);
    expect(blob.split(".")).toHaveLength(3); // iv.tag.ciphertext
    expect(decryptSecret(blob)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("fails to decrypt tampered ciphertext (GCM auth)", () => {
    const blob = encryptSecret("secret-value");
    const [iv, tag, ct] = blob.split(".");
    const tampered = [iv, tag, Buffer.from("garbage").toString("base64")].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
