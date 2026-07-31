import type { Network } from "bitcoinjs-lib";

/** An unspent output the wallet can spend. `script` is the output's scriptPubKey, needed for `witnessUtxo`. */
export interface Utxo {
  readonly txid: string;
  readonly vout: number;
  readonly value: number;
  readonly script: Uint8Array;
}

export interface TransferParams {
  readonly utxos: readonly Utxo[];
  readonly to: string;
  readonly amountSats: number;
  readonly changeAddress: string;
  readonly feeRateSatsPerVbyte: number;
  readonly network?: Network;
}

export interface BumpFeeParams {
  /** The exact inputs the original transaction spent — a replacement must reuse them, that's what makes it a replacement. */
  readonly utxos: readonly Utxo[];
  readonly changeAddress: string;
  readonly feeRateSatsPerVbyte: number;
  /** The absolute fee (sats) the original transaction paid — the new fee must exceed it (BIP-125 rule 3). */
  readonly originalFeeSats: number;
  readonly network?: Network;
}

export interface AccelerateTransferParams extends BumpFeeParams {
  readonly to: string;
  readonly amountSats: number;
}
