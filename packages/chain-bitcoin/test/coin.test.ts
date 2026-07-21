import { HdKeyring, generateMnemonic } from "@openwallet/core";
import { Psbt, networks, payments } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";
import { bitcoinCoin, bitcoinTestnetCoin } from "../src/coin.js";
import { isValidAddress } from "../src/validate.js";
import { signPsbt } from "../src/sign.js";

describe("bitcoinCoin", () => {
  it("derives a mainnet native-SegWit (bc1) address", () => {
    const account = HdKeyring.fromMnemonic(generateMnemonic()).deriveAccount(bitcoinCoin, 0);
    expect(account.path).toBe("m/84'/0'/0'/0/0");
    expect(account.address.startsWith("bc1q")).toBe(true);
  });

  it("derives distinct addresses per account index", () => {
    const keyring = HdKeyring.fromMnemonic(generateMnemonic());
    const first = keyring.deriveAccount(bitcoinCoin, 0);
    const second = keyring.deriveAccount(bitcoinCoin, 1);
    expect(first.address).not.toBe(second.address);
  });
});

describe("bitcoinTestnetCoin", () => {
  it("derives a testnet native-SegWit (tb1) address on coin type 1'", () => {
    const account = HdKeyring.fromMnemonic(generateMnemonic()).deriveAccount(bitcoinTestnetCoin, 0);
    expect(account.path).toBe("m/84'/1'/0'/0/0");
    expect(account.address.startsWith("tb1q")).toBe(true);
    expect(isValidAddress(account.address, networks.testnet)).toBe(true);
  });

  it("derives a different address than mainnet for the same seed and index", () => {
    const keyring = HdKeyring.fromMnemonic(generateMnemonic());
    expect(keyring.deriveAccount(bitcoinTestnetCoin, 0).address).not.toBe(
      keyring.deriveAccount(bitcoinCoin, 0).address,
    );
  });
});

describe("signPsbt", () => {
  it("signs an input spending its own p2wpkh output", () => {
    const account = HdKeyring.fromMnemonic(generateMnemonic()).deriveAccount(bitcoinCoin, 0);
    const { output } = payments.p2wpkh({ pubkey: account.publicKey, network: networks.bitcoin });
    if (!output) throw new Error("failed to build the test output script");

    const psbt = new Psbt({ network: networks.bitcoin });
    psbt.addInput({
      hash: "0".repeat(64),
      index: 0,
      witnessUtxo: { script: output, value: 100_000n },
    });
    psbt.addOutput({ address: account.address, value: 90_000n });

    signPsbt(account.privateKey, psbt);

    expect(psbt.data.inputs[0]?.partialSig).toHaveLength(1);
    expect(() => psbt.finalizeAllInputs()).not.toThrow();
  });
});
