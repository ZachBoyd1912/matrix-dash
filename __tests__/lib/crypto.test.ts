import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "@/lib/utils/crypto";

describe("crypto", () => {
  it("round-trips a plain string", () => {
    const plain = "sk-test-api-key-1234567890";
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it("round-trips an empty string", () => {
    expect(decrypt(encrypt(""))).toBe("");
  });

  it("round-trips unicode and long content", () => {
    const plain = "🔒 encrypted émoji test — " + "x".repeat(5000);
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const plain = "same-input";
    expect(encrypt(plain)).not.toBe(encrypt(plain));
  });

  it("throws when the ciphertext has been tampered with", () => {
    const tampered = encrypt("sensitive").slice(0, -4) + "abcd";
    expect(() => decrypt(tampered)).toThrow();
  });
});
