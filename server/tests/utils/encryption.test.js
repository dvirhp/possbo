import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "../../src/utils/encryption.js";

beforeAll(() => {
  process.env.ENCRYPTION_KEY =
    "test-encryption-key-that-is-at-least-32-chars-long";
});

describe("encryption", () => {
  it("should encrypt and decrypt a string", () => {
    const plaintext = "my-facebook-app-secret-12345";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
    expect(encrypted).not.toBe(plaintext);
  });

  it("should produce different ciphertexts for same plaintext (unique salt)", () => {
    const plaintext = "same-value";
    const enc1 = encrypt(plaintext);
    const enc2 = encrypt(plaintext);

    expect(enc1).not.toBe(enc2);
    expect(decrypt(enc1)).toBe(plaintext);
    expect(decrypt(enc2)).toBe(plaintext);
  });

  it("should handle special characters", () => {
    const plaintext = "p@$$w0rd!#%^&*(){}[]|\\:\";<>?,./~`";
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("should handle empty string", () => {
    const encrypted = encrypt("");
    expect(decrypt(encrypted)).toBe("");
  });

  it("encrypted format should be salt:iv:tag:ciphertext", () => {
    const encrypted = encrypt("test");
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(4);
  });

  it("should throw when decrypting corrupted ciphertext (wrong format)", () => {
    expect(() => decrypt("not:enough:parts")).toThrow();
    expect(() => decrypt("onlyone")).toThrow();
  });

  it("should throw when decrypting tampered ciphertext", () => {
    const encrypted = encrypt("sensitive-data");
    const parts = encrypted.split(":");
    // Tamper with the ciphertext portion
    parts[3] = "ff".repeat(parts[3].length / 2);
    const tampered = parts.join(":");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("should throw when auth tag is corrupted", () => {
    const encrypted = encrypt("test-data");
    const parts = encrypted.split(":");
    // Corrupt the auth tag
    parts[2] = "00".repeat(parts[2].length / 2);
    const corrupted = parts.join(":");
    expect(() => decrypt(corrupted)).toThrow();
  });

  it("should handle unicode and Hebrew text", () => {
    const plaintext = "שלום עולם 🌍 مرحبا";
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("should handle very long strings", () => {
    const plaintext = "a".repeat(100000);
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("should throw when ENCRYPTION_KEY is too short", () => {
    const original = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "short";
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY");
    process.env.ENCRYPTION_KEY = original;
  });

  it("should throw when ENCRYPTION_KEY is missing", () => {
    const original = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY");
    process.env.ENCRYPTION_KEY = original;
  });

  it("should fail decryption with a different encryption key", () => {
    const encrypted = encrypt("secret");
    const original = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY =
      "different-encryption-key-that-is-at-least-32-chars";
    expect(() => decrypt(encrypted)).toThrow();
    process.env.ENCRYPTION_KEY = original;
  });

  it("should only contain hex characters in each part", () => {
    const encrypted = encrypt("test");
    const parts = encrypted.split(":");
    parts.forEach((part) => {
      expect(part).toMatch(/^[0-9a-f]+$/);
    });
  });
});
