import { Psbt, networks } from "bitcoinjs-lib";
import { DUST_THRESHOLD_SATS, RBF_SEQUENCE } from "./constants.js";
import { estimateVsize } from "./fee.js";
import { InsufficientFundsError } from "./errors.js";
import type { Utxo, TransferParams } from "./types.js";

/**
 * Builds a ready-to-sign PSBT for a native-SegWit (p2wpkh) transfer.
 *
 * UTXOs are supplied by the caller rather than fetched here — *which*
 * indexer or node to ask (mempool.space, Electrum, a self-hosted node) is a
 * platform/product choice this package deliberately stays out of, unlike
 * `chain-evm`/`chain-solana` where a public RPC client is the obvious,
 * unopinionated default.
 *
 * Coin selection is naive first-fit: accumulates `utxos` in the order
 * given until the running total covers the amount plus the estimated fee
 * for the inputs picked so far (assuming a change output). It doesn't
 * optimize for fewest inputs or lowest fee — pre-sort/curate `utxos` for
 * that, or swap in a real selection algorithm once it matters.
 *
 * Every input is marked BIP-125 replaceable (`RBF_SEQUENCE`) — see `rbf.ts`
 * — so a transaction built here can always be fee-bumped or canceled later;
 * there's no reason a wallet would ever want to opt out of that.
 */
export function buildTransferPsbt(params: TransferParams): Psbt {
  const network = params.network ?? networks.bitcoin;

  let inputTotal = 0;
  const selected: Utxo[] = [];
  for (const utxo of params.utxos) {
    selected.push(utxo);
    inputTotal += utxo.value;
    const fee = estimateVsize(selected.length, 2) * params.feeRateSatsPerVbyte;
    if (inputTotal >= params.amountSats + fee) {
      break;
    }
  }

  const fee = estimateVsize(selected.length, 2) * params.feeRateSatsPerVbyte;
  if (inputTotal < params.amountSats + fee) {
    throw new InsufficientFundsError("Selected UTXOs don't cover the transfer amount plus fee");
  }

  const psbt = new Psbt({ network });
  for (const utxo of selected) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      sequence: RBF_SEQUENCE,
      witnessUtxo: { script: utxo.script, value: BigInt(utxo.value) },
    });
  }

  psbt.addOutput({ address: params.to, value: BigInt(params.amountSats) });

  // Leftover below dust just becomes extra fee, same as every other wallet does.
  const change = inputTotal - params.amountSats - fee;
  if (change > DUST_THRESHOLD_SATS) {
    psbt.addOutput({ address: params.changeAddress, value: BigInt(Math.round(change)) });
  }

  return psbt;
}
