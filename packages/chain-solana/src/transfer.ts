import type { Connection, TransactionSignature, VersionedTransaction } from "@solana/web3.js";
import { SystemProgram, Transaction } from "@solana/web3.js";
import type { NativeTransferParams } from "./types.js";

/**
 * Builds a ready-to-sign native SOL transfer: fetches a recent blockhash and
 * wraps a single `SystemProgram.transfer` instruction — the exact shape
 * `sign.ts#signTransaction` expects. SPL token transfers are a different,
 * larger instruction set worth adding once something needs them, not a
 * flag bolted onto this function.
 */
export async function buildNativeTransfer(
  connection: Connection,
  params: NativeTransferParams,
): Promise<Transaction> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  return new Transaction({ feePayer: params.from, blockhash, lastValidBlockHeight }).add(
    SystemProgram.transfer({
      fromPubkey: params.from,
      toPubkey: params.to,
      lamports: params.lamports,
    }),
  );
}

/**
 * Broadcasts an already-signed transaction and returns its signature. Takes
 * `VersionedTransaction` too (not just this package's own `buildNativeTransfer`
 * shape) so an aggregator-built swap transaction can go through the same
 * broadcast call as a native transfer.
 */
export async function broadcastTransaction(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
): Promise<TransactionSignature> {
  return connection.sendRawTransaction(transaction.serialize());
}
