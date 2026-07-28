import {
  broadcastTransaction,
  buildTransaction,
  createEvmClient,
  signMessage,
  signTransaction,
  signTypedData as signEvmTypedData,
} from "@openwallet/chain-evm";
import type { Address, Hex, TypedDataDefinition } from "viem";
import type { EvmNetwork } from "../../config/networks.js";
import type { SignWith } from "../chains.js";

// A dApp-supplied transaction, already parsed to base units.
export interface DappTx {
  readonly to: string | null;
  readonly value: bigint;
  readonly data: string;
  readonly gas: bigint | null;
}

// EIP-191 personal_sign over the raw message bytes.
export async function personalSign(signWith: SignWith, messageHex: string): Promise<string> {
  const signature = await signWith((privateKey) =>
    signMessage(privateKey, { raw: messageHex as Hex }),
  );
  return signature as string;
}

// EIP-712 typed-data signing (v4).
export async function signTypedData(
  signWith: SignWith,
  typedData: TypedDataDefinition,
): Promise<string> {
  const signature = await signWith((privateKey) => signEvmTypedData(privateKey, typedData));
  return signature as string;
}

// Builds, signs, and broadcasts one EIP-1559 tx via the shared chain-evm
// pipeline. Nonce and fees are filled from the node; gas uses the dApp's
// estimate or ours.
export async function sendTransaction(
  network: EvmNetwork,
  from: string,
  tx: DappTx,
  signWith: SignWith,
): Promise<string> {
  const client = createEvmClient(network.rpcUrl, network.chain);
  const request = await buildTransaction(client, {
    from: from as Address,
    to: (tx.to ?? undefined) as Address | undefined,
    data: tx.data as Hex,
    value: tx.value,
    gas: tx.gas ?? undefined,
  });
  const signed = (await signWith((privateKey) => signTransaction(privateKey, request))) as Hex;
  return broadcastTransaction(client, signed);
}
