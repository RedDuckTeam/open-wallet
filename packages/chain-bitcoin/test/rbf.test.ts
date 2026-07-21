import { HdKeyring, generateMnemonic } from "@openwallet/core";
import { networks, payments } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";
import { bitcoinCoin } from "../src/coin.js";
import { RBF_SEQUENCE } from "../src/constants.js";
import { accelerateTransfer, cancelTransfer } from "../src/rbf.js";
import { signPsbt } from "../src/sign.js";
import { InsufficientFundsError, FeeTooLowError } from "../src/errors.js";
import type { Utxo } from "../src/types.js";

function ownUtxo(script: Uint8Array, txid: string, value: number): Utxo {
  return { txid, vout: 0, value, script };
}

function testAccount(): {
  privateKey: Uint8Array;
  address: string;
  script: Uint8Array;
} {
  const account = HdKeyring.fromMnemonic(generateMnemonic()).deriveAccount(bitcoinCoin, 0);
  const { output } = payments.p2wpkh({ pubkey: account.publicKey, network: networks.bitcoin });
  if (!output) throw new Error("failed to build the test output script");
  return { privateKey: account.privateKey, address: account.address, script: output };
}

describe("accelerateTransfer", () => {
  it("keeps the same payment, raises the fee, and shrinks the change", () => {
    const account = testAccount();
    const utxos = [ownUtxo(account.script, "a".repeat(64), 100_000)];

    const psbt = accelerateTransfer({
      utxos,
      to: account.address,
      amountSats: 40_000,
      changeAddress: account.address,
      feeRateSatsPerVbyte: 5,
      originalFeeSats: 140, // what buildTransferPsbt would have paid at 1 sat/vbyte
    });

    expect(psbt.txInputs).toHaveLength(1);
    expect(psbt.txOutputs[0]?.value).toBe(40_000n);
    // Every input must still be replaceable, in case this needs bumping again.
    expect(psbt.txInputs[0]?.sequence).toBe(RBF_SEQUENCE);
  });

  it("rejects a fee that isn't strictly higher than the original", () => {
    const account = testAccount();
    const utxos = [ownUtxo(account.script, "a".repeat(64), 100_000)];

    expect(() =>
      accelerateTransfer({
        utxos,
        to: account.address,
        amountSats: 40_000,
        changeAddress: account.address,
        feeRateSatsPerVbyte: 1,
        originalFeeSats: 999_999,
      }),
    ).toThrow(FeeTooLowError);
  });

  it("rejects a higher fee that still doesn't clear BIP-125 rule 4's incremental relay fee", () => {
    const account = testAccount();
    const utxos = [ownUtxo(account.script, "a".repeat(64), 100_000)];
    // vsize for 1 input / 2 outputs = 10 + 68 + 2*31 = 140, so rule 4 requires
    // at least ceil(0.1 * 140) = 14 sats more than the original 140 — this
    // bump is only 7, higher than the original but not high enough.
    expect(() =>
      accelerateTransfer({
        utxos,
        to: account.address,
        amountSats: 40_000,
        changeAddress: account.address,
        feeRateSatsPerVbyte: 147 / 140,
        originalFeeSats: 140,
      }),
    ).toThrow(FeeTooLowError);
  });

  it("accepts a fee that meets rule 4's incremental relay fee exactly", () => {
    const account = testAccount();
    const utxos = [ownUtxo(account.script, "a".repeat(64), 100_000)];
    // Same 140-vsize case as above, bumped by exactly the required 14 sats.
    const psbt = accelerateTransfer({
      utxos,
      to: account.address,
      amountSats: 40_000,
      changeAddress: account.address,
      feeRateSatsPerVbyte: 154 / 140,
      originalFeeSats: 140,
    });
    expect(psbt.txInputs).toHaveLength(1);
  });

  it("throws InsufficientFundsError if the bumped fee would exceed the inputs", () => {
    const account = testAccount();
    const utxos = [ownUtxo(account.script, "a".repeat(64), 40_100)];

    expect(() =>
      accelerateTransfer({
        utxos,
        to: account.address,
        amountSats: 40_000,
        changeAddress: account.address,
        feeRateSatsPerVbyte: 50,
        originalFeeSats: 140,
      }),
    ).toThrow(InsufficientFundsError);
  });

  it("produces a PSBT that signs and finalizes end to end", () => {
    const account = testAccount();
    const utxos = [ownUtxo(account.script, "a".repeat(64), 100_000)];

    const psbt = accelerateTransfer({
      utxos,
      to: account.address,
      amountSats: 40_000,
      changeAddress: account.address,
      feeRateSatsPerVbyte: 5,
      originalFeeSats: 140,
    });

    signPsbt(account.privateKey, psbt);
    expect(() => psbt.finalizeAllInputs()).not.toThrow();
    expect(() => psbt.extractTransaction()).not.toThrow();
  });
});

describe("cancelTransfer", () => {
  it("returns everything to the change address in a single output", () => {
    const account = testAccount();
    const utxos = [ownUtxo(account.script, "a".repeat(64), 100_000)];

    const psbt = cancelTransfer({
      utxos,
      changeAddress: account.address,
      feeRateSatsPerVbyte: 5,
      originalFeeSats: 140,
    });

    expect(psbt.txOutputs).toHaveLength(1);
    expect(psbt.txOutputs[0]?.address).toBe(account.address);
    // fee for 1 input / 1 output @ 5 sat/vbyte = (10 + 68 + 31) * 5 = 545.
    expect(psbt.txOutputs[0]?.value).toBe(100_000n - 545n);
  });

  it("rejects a fee that isn't strictly higher than the original", () => {
    const account = testAccount();
    const utxos = [ownUtxo(account.script, "a".repeat(64), 100_000)];

    expect(() =>
      cancelTransfer({
        utxos,
        changeAddress: account.address,
        feeRateSatsPerVbyte: 1,
        originalFeeSats: 999_999,
      }),
    ).toThrow(FeeTooLowError);
  });

  it("rejects a higher fee that still doesn't clear BIP-125 rule 4's incremental relay fee", () => {
    const account = testAccount();
    const utxos = [ownUtxo(account.script, "a".repeat(64), 100_000)];
    // vsize for 1 input / 1 output = 10 + 68 + 31 = 109, so rule 4 requires
    // at least ceil(0.1 * 109) = 11 sats more than the original 109 — this
    // bump is only 5.
    expect(() =>
      cancelTransfer({
        utxos,
        changeAddress: account.address,
        feeRateSatsPerVbyte: 114 / 109,
        originalFeeSats: 109,
      }),
    ).toThrow(FeeTooLowError);
  });

  it("accepts a fee that meets rule 4's incremental relay fee exactly", () => {
    const account = testAccount();
    const utxos = [ownUtxo(account.script, "a".repeat(64), 100_000)];
    const psbt = cancelTransfer({
      utxos,
      changeAddress: account.address,
      feeRateSatsPerVbyte: 120 / 109,
      originalFeeSats: 109,
    });
    expect(psbt.txOutputs).toHaveLength(1);
  });

  it("produces a PSBT that signs and finalizes end to end", () => {
    const account = testAccount();
    const utxos = [ownUtxo(account.script, "a".repeat(64), 100_000)];

    const psbt = cancelTransfer({
      utxos,
      changeAddress: account.address,
      feeRateSatsPerVbyte: 5,
      originalFeeSats: 140,
    });

    signPsbt(account.privateKey, psbt);
    expect(() => psbt.finalizeAllInputs()).not.toThrow();
    expect(() => psbt.extractTransaction()).not.toThrow();
  });
});
