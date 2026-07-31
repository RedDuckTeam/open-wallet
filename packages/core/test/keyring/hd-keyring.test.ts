import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import type { CoinEntry } from "../../src/keyring/types.js";
import { HdKeyring } from "../../src/keyring/hd-keyring.js";

const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const stubCoin: CoinEntry = {
  id: "stub-secp256k1",
  curve: "secp256k1",
  derivationPath: (accountIndex) => `m/44'/0'/0'/0/${String(accountIndex)}`,
  deriveAddress: (publicKey) => `stub:${bytesToHex(publicKey)}`,
};

describe("HdKeyring", () => {
  it("derives deterministic accounts from the same mnemonic", () => {
    const a = HdKeyring.fromMnemonic(TEST_MNEMONIC).deriveAccount(stubCoin, 0);
    const b = HdKeyring.fromMnemonic(TEST_MNEMONIC).deriveAccount(stubCoin, 0);
    expect(a.address).toBe(b.address);
    expect(a.privateKey).toEqual(b.privateKey);
  });

  it("derives distinct accounts per account index", () => {
    const keyring = HdKeyring.fromMnemonic(TEST_MNEMONIC);
    const first = keyring.deriveAccount(stubCoin, 0);
    const second = keyring.deriveAccount(stubCoin, 1);
    expect(first.address).not.toBe(second.address);
    expect(first.path).not.toBe(second.path);
  });

  it("rejects an invalid mnemonic", () => {
    expect(() => HdKeyring.fromMnemonic("not a real mnemonic at all")).toThrow();
  });

  it("becomes unusable after wipe()", () => {
    const keyring = HdKeyring.fromMnemonic(TEST_MNEMONIC);
    keyring.wipe();
    expect(() => keyring.deriveAccount(stubCoin, 0)).toThrow(/locked/);
  });

  it.each([-1, 1.5, NaN, Infinity])(
    "rejects a non-negative-integer account index (%s) before it ever reaches derivation",
    (accountIndex) => {
      const keyring = HdKeyring.fromMnemonic(TEST_MNEMONIC);
      expect(() => keyring.deriveAccount(stubCoin, accountIndex)).toThrow(/non-negative integer/);
    },
  );
});
