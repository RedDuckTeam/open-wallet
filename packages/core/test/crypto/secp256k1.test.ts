import { HDKey } from "@scure/bip32";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { deriveSecp256k1 } from "../../src/crypto/secp256k1.js";

// Official BIP-32 "Test vector 1" (bitcoin/bips, bip-0032.mediawiki), chain
// m/0'. We decode the spec's published xprv independently (a different code
// path than derivation: `fromExtendedKey` vs `fromMasterSeed().derive()`) so
// the comparison is a real check against the spec's known answer, not a
// tautology.
const SEED = "000102030405060708090a0b0c0d0e0f";
const EXPECTED_XPRV_M0H =
  "xprv9uHRZZhk6KAJC1avXpDAp4MDc3sQKNxDiPvvkX8Br5ngLNv1TxvUxt4cV1rGL5hj6KCesnDYUhd7oWgT11eZG7XnxHrnYeSvkzY7d2bhkJ7";

describe("deriveSecp256k1", () => {
  it("matches the official BIP-32 test vector 1 at m/0'", () => {
    const expected = HDKey.fromExtendedKey(EXPECTED_XPRV_M0H);
    const { privateKey, publicKey } = deriveSecp256k1(hexToBytes(SEED), "m/0'");
    expect(bytesToHex(privateKey)).toBe(bytesToHex(expected.privateKey!));
    expect(bytesToHex(publicKey)).toBe(bytesToHex(expected.publicKey!));
  });
});
