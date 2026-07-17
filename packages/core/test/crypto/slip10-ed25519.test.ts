import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { deriveEd25519 } from "../../src/crypto/slip10-ed25519.js";

// SLIP-0010 official "Test vector 1 for ed25519".
// https://github.com/satoshilabs/slips/blob/master/slip-0010.md
// The spec's published public keys carry a leading 0x00 marker byte before
// the raw 32-byte ed25519 key; it's stripped below.
const SEED = "000102030405060708090a0b0c0d0e0f";

describe("deriveEd25519 (SLIP-0010)", () => {
  it("matches the spec's master key (chain m)", () => {
    const { privateKey, publicKey } = deriveEd25519(hexToBytes(SEED), "m");
    expect(bytesToHex(privateKey)).toBe(
      "2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7",
    );
    expect(bytesToHex(publicKey)).toBe(
      "a4b2856bfec510abab89753fac1ac0e1112364e7d250545963f135f2a33188ed",
    );
  });

  it("matches the spec's m/0'/1'/2' derivation", () => {
    const { privateKey, publicKey } = deriveEd25519(hexToBytes(SEED), "m/0'/1'/2'");
    expect(bytesToHex(privateKey)).toBe(
      "92a5b23c0b8a99e37d07df3fb9966917f5d06e02ddbd909c7e184371463e9fc9",
    );
    expect(bytesToHex(publicKey)).toBe(
      "ae98736566d30ed0e9d2f4486a64bc95740d89c7db33f52121f8ea8f76ff0fc1",
    );
  });

  it("rejects a non-hardened path segment", () => {
    // SLIP-0010 ed25519 has no defined non-hardened derivation (see module doc in src).
    expect(() => deriveEd25519(hexToBytes(SEED), "m/0")).toThrow();
  });

  // Regression: Number.parseInt is lenient enough that a naive parser
  // would silently derive a real (wrong) key for every one of these,
  // instead of failing the way an obviously-invalid path should.
  it("rejects a negative index instead of silently deriving a different key", () => {
    expect(() => deriveEd25519(hexToBytes(SEED), "m/-1'")).toThrow(/non-negative integer/);
  });

  it("rejects a fractional-looking index instead of silently truncating it", () => {
    expect(() => deriveEd25519(hexToBytes(SEED), "m/1.5'")).toThrow(/non-negative integer/);
  });

  it("rejects a non-numeric index instead of silently coercing it to 0", () => {
    expect(() => deriveEd25519(hexToBytes(SEED), "m/abc'")).toThrow(/non-negative integer/);
  });

  it("rejects an index beyond the valid hardened range", () => {
    expect(() => deriveEd25519(hexToBytes(SEED), "m/2147483648'")).toThrow(/must be at most/);
  });
});
