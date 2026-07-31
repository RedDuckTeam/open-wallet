import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { generateMnemonic, mnemonicToSeed, validateMnemonic } from "../../src/crypto/mnemonic.js";

// Official BIP-39 test vector (trezor/python-mnemonic vectors.json, entry 0),
// derived with the suite's standard "TREZOR" passphrase.
const VECTOR_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const VECTOR_SEED_HEX =
  "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04";

describe("mnemonic", () => {
  it("derives the official BIP-39 test seed", () => {
    expect(validateMnemonic(VECTOR_MNEMONIC)).toBe(true);
    expect(bytesToHex(mnemonicToSeed(VECTOR_MNEMONIC, "TREZOR"))).toBe(VECTOR_SEED_HEX);
  });

  it("rejects a mnemonic with a bad checksum", () => {
    const brokenChecksum = VECTOR_MNEMONIC.replace(/about$/, "abandon");
    expect(validateMnemonic(brokenChecksum)).toBe(false);
  });

  it("generates a valid, non-repeating mnemonic", () => {
    const a = generateMnemonic();
    const b = generateMnemonic();
    expect(validateMnemonic(a)).toBe(true);
    expect(a.split(" ")).toHaveLength(12);
    expect(a).not.toBe(b);
  });
});
