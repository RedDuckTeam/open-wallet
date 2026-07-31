import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import type { CoinEntry } from "../../src/keyring/types.js";
import { ImportedKeyring } from "../../src/keyring/imported-keyring.js";

const stubCoin: CoinEntry = {
  id: "stub",
  curve: "secp256k1",
  derivationPath: () => "n/a",
  deriveAddress: (publicKey) => `stub:${bytesToHex(publicKey)}`,
};

function testPrivateKey(): Uint8Array {
  const key = new Uint8Array(32);
  key[31] = 1;
  return key;
}

describe("ImportedKeyring.fromPrivateKey", () => {
  it("derives the account's address from the matching public key", () => {
    const keyring = ImportedKeyring.fromPrivateKey(stubCoin, testPrivateKey());
    expect(keyring.account.coinId).toBe("stub");
    expect(keyring.account.address).toBe(`stub:${bytesToHex(keyring.account.publicKey)}`);
  });

  it("owns an independent copy of the private key", () => {
    const original = testPrivateKey();
    const keyring = ImportedKeyring.fromPrivateKey(stubCoin, original);
    original.fill(0);
    expect(keyring.exportPrivateKey()).toEqual(testPrivateKey());
  });
});

describe("ImportedKeyring", () => {
  it("exportPrivateKey returns a fresh copy each time, not the live buffer", () => {
    const keyring = ImportedKeyring.fromPrivateKey(stubCoin, testPrivateKey());
    const first = keyring.exportPrivateKey();
    first.fill(0);
    expect(keyring.exportPrivateKey()).toEqual(testPrivateKey());
  });

  it("becomes unusable after wipe()", () => {
    const keyring = ImportedKeyring.fromPrivateKey(stubCoin, testPrivateKey());
    keyring.wipe();
    expect(() => keyring.exportPrivateKey()).toThrow(/wiped/);
  });
});
