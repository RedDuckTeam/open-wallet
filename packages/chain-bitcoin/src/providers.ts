import type { Utxo } from "./types.js";

/**
 * Supplies the unspent outputs an address can spend. `buildTransferPsbt`
 * takes UTXOs as an argument on purpose — *which* indexer or node to ask
 * (mempool.space, Electrum, a self-hosted node) is a platform choice this
 * package stays out of. The adapter closes that gap with dependency
 * injection: a consumer provides the source, the adapter stays unopinionated.
 */
export interface UtxoProvider {
  listUtxos(address: string): Promise<readonly Utxo[]>;
}

/** Supplies a current fee rate, in satoshis per vbyte. */
export interface FeeRateSource {
  getFeeRate(): Promise<number>;
}

/** Broadcasts a finalized raw-transaction hex and returns its txid. */
export interface Broadcaster {
  broadcast(rawTxHex: string): Promise<string>;
}
