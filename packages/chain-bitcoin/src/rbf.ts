import { Psbt, networks } from "bitcoinjs-lib";
import {
  DUST_THRESHOLD_SATS,
  INCREMENTAL_RELAY_FEE_SATS_PER_VBYTE,
  RBF_SEQUENCE,
} from "./constants.js";
import { estimateVsize } from "./fee.js";
import { InsufficientFundsError, FeeTooLowError } from "./errors.js";
import type { Utxo, BumpFeeParams, AccelerateTransferParams } from "./types.js";

function sumUtxos(utxos: readonly Utxo[]): number {
  return utxos.reduce((total, utxo) => total + utxo.value, 0);
}

/**
 * BIP-125 rule 4: the additional fee (new minus original) must itself pay
 * for the replacement's bandwidth at or above the incremental relay
 * feerate — `newFeeSats > originalFeeSats` alone (rule 3) isn't sufficient.
 * `Math.ceil` rounds the fractional-satoshi rate up rather than down, so
 * the computed minimum never falls a fraction of a satoshi short of what a
 * real node requires.
 */
function assertFeeIsHighEnough(newFeeSats: number, originalFeeSats: number, vsize: number): void {
  const minimumBump = Math.ceil(INCREMENTAL_RELAY_FEE_SATS_PER_VBYTE * vsize);
  if (newFeeSats < originalFeeSats + minimumBump) {
    throw new FeeTooLowError(
      "A BIP-125 replacement must pay a higher absolute fee than the transaction it replaces, by enough to cover its own bandwidth at the incremental relay fee rate (rule 4) — not just any amount more",
    );
  }
}

function addReplacementInputs(psbt: Psbt, utxos: readonly Utxo[]): void {
  for (const utxo of utxos) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      sequence: RBF_SEQUENCE,
      witnessUtxo: { script: utxo.script, value: BigInt(utxo.value) },
    });
  }
}

/**
 * "Speed up": rebuilds the transaction with the same inputs and the same
 * payment to `to`, at a higher fee — the fee comes out of the change, same
 * as building a fresh transfer would, just constrained to the original's
 * inputs instead of selecting new ones.
 */
export function accelerateTransfer(params: AccelerateTransferParams): Psbt {
  const inputTotal = sumUtxos(params.utxos);
  const vsize = estimateVsize(params.utxos.length, 2);
  const fee = vsize * params.feeRateSatsPerVbyte;
  assertFeeIsHighEnough(fee, params.originalFeeSats, vsize);

  const change = inputTotal - params.amountSats - fee;
  if (change < 0) {
    throw new InsufficientFundsError("Selected UTXOs don't cover the transfer amount plus fee");
  }

  const network = params.network ?? networks.bitcoin;
  const psbt = new Psbt({ network });
  addReplacementInputs(psbt, params.utxos);
  psbt.addOutput({ address: params.to, value: BigInt(params.amountSats) });
  if (change > DUST_THRESHOLD_SATS) {
    psbt.addOutput({ address: params.changeAddress, value: BigInt(Math.round(change)) });
  }
  return psbt;
}

/**
 * "Cancel": rebuilds the transaction with the same inputs but drops the
 * original payment entirely — every input's value, minus the new (higher)
 * fee, comes back to `changeAddress`. Only works before the original
 * confirms, same as `accelerateTransfer`; this package has no way to check
 * confirmation status itself (see `docs/architecture.md`), so that check is
 * the caller's responsibility.
 */
export function cancelTransfer(params: BumpFeeParams): Psbt {
  const inputTotal = sumUtxos(params.utxos);
  const vsize = estimateVsize(params.utxos.length, 1);
  const fee = vsize * params.feeRateSatsPerVbyte;
  assertFeeIsHighEnough(fee, params.originalFeeSats, vsize);

  const remaining = inputTotal - fee;
  if (remaining <= DUST_THRESHOLD_SATS) {
    throw new InsufficientFundsError("Selected UTXOs don't cover the transfer amount plus fee");
  }

  const network = params.network ?? networks.bitcoin;
  const psbt = new Psbt({ network });
  addReplacementInputs(psbt, params.utxos);
  psbt.addOutput({ address: params.changeAddress, value: BigInt(Math.round(remaining)) });
  return psbt;
}
