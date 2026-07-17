import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { deriveKey } from "../../src/crypto/kdf.js";
import { DEFAULT_KDF_PARAMS } from "../../src/crypto/constants.js";
import { utf8ToBytes } from "../../src/crypto/bytes.js";

// RFC 7914 §12's scrypt test vector for P="pleaseletmein", S="SodiumChloride",
// N=16384, r=8, p=1 — independently verified against the RFC text (which
// publishes a 64-byte dkLen=64 output; scrypt's final PBKDF2-HMAC-SHA256
// stage computes output blocks independently by counter, so this package's
// fixed 32-byte `deriveKey` output is exactly that vector's first 32 bytes,
// confirmed by running both dkLen=32 and dkLen=64 through @noble/hashes and
// comparing before hardcoding this).
const RFC7914_N16384_KEY = "7023bdcb3afd7348461c06cd81fd38ebfda8fbba904f8e3ea9b543f6545da1f2";

describe("deriveKey", () => {
  it("matches the RFC 7914 scrypt test vector (N=16384, r=8, p=1)", async () => {
    const key = await deriveKey("pleaseletmein", utf8ToBytes("SodiumChloride"), {
      N: 16384,
      r: 8,
      p: 1,
    });
    expect(bytesToHex(key)).toBe(RFC7914_N16384_KEY);
  });

  it("derives a 32-byte key", async () => {
    const key = await deriveKey("password", utf8ToBytes("salt"), { N: 1024, r: 8, p: 1 });
    expect(key).toHaveLength(32);
  });

  it("is deterministic for the same password and salt", async () => {
    const params = { N: 1024, r: 8, p: 1 };
    const salt = utf8ToBytes("salt");
    const first = await deriveKey("password", salt, params);
    const second = await deriveKey("password", salt, params);
    expect(bytesToHex(first)).toBe(bytesToHex(second));
  });

  it("derives a different key for a different password", async () => {
    const params = { N: 1024, r: 8, p: 1 };
    const salt = utf8ToBytes("salt");
    const first = await deriveKey("password one", salt, params);
    const second = await deriveKey("password two", salt, params);
    expect(bytesToHex(first)).not.toBe(bytesToHex(second));
  });

  it("derives a different key for a different salt", async () => {
    const params = { N: 1024, r: 8, p: 1 };
    const first = await deriveKey("password", utf8ToBytes("salt one"), params);
    const second = await deriveKey("password", utf8ToBytes("salt two"), params);
    expect(bytesToHex(first)).not.toBe(bytesToHex(second));
  });

  it("defaults to DEFAULT_KDF_PARAMS when none are given", async () => {
    const salt = utf8ToBytes("salt");
    const withDefault = await deriveKey("password", salt);
    const withExplicit = await deriveKey("password", salt, DEFAULT_KDF_PARAMS);
    expect(bytesToHex(withDefault)).toBe(bytesToHex(withExplicit));
  });
});
