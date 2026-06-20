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
});
