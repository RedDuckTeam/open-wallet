import type { Address, Hash, Hex, PublicClient, TransactionSerializableEIP1559 } from "viem";
import type { NativeTransferParams } from "./types.js";

export interface RawTransactionParams {
  readonly from: Address;
  /** Omit for a contract-creation call. */
  readonly to?: Address;
  readonly value?: bigint;
  readonly data?: Hex;
  /** Skips `estimateGas` when the caller already has one (e.g. a dApp-supplied or aggregator-quoted gas limit). */
  readonly gas?: bigint;
}

/**
 * Builds a ready-to-sign EIP-1559 transaction: fetches nonce, current fee
 * estimate, a gas estimate (unless one is given), and the chain id, and
 * returns them as one `TransactionSerializable` — the exact shape
 * `sign.ts#signTransaction` expects. This is the one place that dance lives;
 * every caller (native transfer, ERC-20 transfer, dApp-requested sends, swap
 * execution) builds through this rather than re-deriving nonce/fees/gas itself.
 */
export async function buildTransaction(
  client: PublicClient,
  params: RawTransactionParams,
): Promise<TransactionSerializableEIP1559> {
  const value = params.value ?? 0n;
  const [nonce, fees, gas, chainId] = await Promise.all([
    client.getTransactionCount({ address: params.from, blockTag: "pending" }),
    client.estimateFeesPerGas(),
    params.gas ??
      client.estimateGas({ account: params.from, to: params.to, value, data: params.data }),
    client.getChainId(),
  ]);

  return {
    type: "eip1559",
    chainId,
    nonce,
    to: params.to,
    value,
    data: params.data,
    gas,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
  };
}

/**
 * Deliberately just the native-currency case, for callers that only have a
 * `from`/`to`/`value` and want the narrower `NativeTransferParams` type.
 */
export function buildNativeTransfer(
  client: PublicClient,
  params: NativeTransferParams,
): Promise<TransactionSerializableEIP1559> {
  return buildTransaction(client, params);
}

/** Broadcasts an already-signed transaction (the `Hex` `signTransaction` returns) and returns its hash. */
export async function broadcastTransaction(
  client: PublicClient,
  serializedTransaction: Hex,
): Promise<Hash> {
  return client.sendRawTransaction({ serializedTransaction });
}
