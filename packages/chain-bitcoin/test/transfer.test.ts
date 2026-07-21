import { HdKeyring, generateMnemonic } from "@openwallet/core";
import { networks, payments } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";
import { bitcoinCoin } from "../src/coin.js";
import { signPsbt } from "../src/sign.js";
import { buildTransferPsbt } from "../src/transfer.js";
import { InsufficientFundsError } from "../src/errors.js";
import type { Utxo } from "../src/types.js";

function ownUtxo(script: Uint8Array, txid: string, value: number): Utxo {
  return { txid, vout: 0, value, script };
}

describe("buildTransferPsbt", () => {
  it("selects only as many UTXOs as needed and adds a change output", () => {
    const account = HdKeyring.fromMnemonic(generateMnemonic()).deriveAccount(bitcoinCoin, 0);
    const { output } = payments.p2wpkh({ pubkey: account.publicKey, network: networks.bitcoin });
    if (!output) throw new Error("failed to build the test output script");

    const utxos = [
      ownUtxo(output, "a".repeat(64), 50_000),
      ownUtxo(output, "b".repeat(64), 100_000),
    ];

    const psbt = buildTransferPsbt({
      utxos,
      to: account.address,
      amountSats: 40_000,
      changeAddress: account.address,
      feeRateSatsPerVbyte: 1,
    });

    // 50_000 alone covers 40_000 + fee for a 1-input/2-output tx, so the
    // second UTXO should never be touched.
    expect(psbt.txInputs).toHaveLength(1);
    expect(psbt.txOutputs).toHaveLength(2);
    expect(psbt.txOutputs[0]?.value).toBe(40_000n);
  });

  it("throws InsufficientFundsError when the UTXOs can't cover the amount plus fee", () => {
    const account = HdKeyring.fromMnemonic(generateMnemonic()).deriveAccount(bitcoinCoin, 0);
    const { output } = payments.p2wpkh({ pubkey: account.publicKey, network: networks.bitcoin });
    if (!output) throw new Error("failed to build the test output script");

    expect(() =>
      buildTransferPsbt({
        utxos: [ownUtxo(output, "a".repeat(64), 10_000)],
        to: account.address,
        amountSats: 40_000,
        changeAddress: account.address,
        feeRateSatsPerVbyte: 1,
      }),
    ).toThrow(InsufficientFundsError);
  });

  it("drops the change output when the leftover would be dust", () => {
    const account = HdKeyring.fromMnemonic(generateMnemonic()).deriveAccount(bitcoinCoin, 0);
    const { output } = payments.p2wpkh({ pubkey: account.publicKey, network: networks.bitcoin });
    if (!output) throw new Error("failed to build the test output script");

    // fee for 1 input / 2 outputs @ 1 sat/vbyte = 10 + 68 + 31*2 = 140 sats.
    // Leftover after amount + fee is well under the 546-sat dust threshold.
    const psbt = buildTransferPsbt({
      utxos: [ownUtxo(output, "a".repeat(64), 40_200)],
      to: account.address,
      amountSats: 40_000,
      changeAddress: account.address,
      feeRateSatsPerVbyte: 1,
    });

    expect(psbt.txOutputs).toHaveLength(1);
  });

  it("produces a PSBT that signs and finalizes end to end", () => {
    const account = HdKeyring.fromMnemonic(generateMnemonic()).deriveAccount(bitcoinCoin, 0);
    const { output } = payments.p2wpkh({ pubkey: account.publicKey, network: networks.bitcoin });
    if (!output) throw new Error("failed to build the test output script");

    const psbt = buildTransferPsbt({
      utxos: [ownUtxo(output, "a".repeat(64), 100_000)],
      to: account.address,
      amountSats: 40_000,
      changeAddress: account.address,
      feeRateSatsPerVbyte: 1,
    });

    signPsbt(account.privateKey, psbt);
    expect(() => psbt.finalizeAllInputs()).not.toThrow();
    expect(() => psbt.extractTransaction()).not.toThrow();
  });
});
