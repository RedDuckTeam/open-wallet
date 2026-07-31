import {
  encodeFunctionData,
  type Address,
  type PublicClient,
  type TransactionSerializableEIP1559,
} from "viem";
import { ERC20_ABI } from "./abi.js";
import { buildTransaction } from "./transfer.js";
import type { Erc20Metadata, Erc20TransferParams } from "./types.js";

export async function getErc20Balance(
  client: PublicClient,
  token: Address,
  owner: Address,
): Promise<bigint> {
  return client.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [owner],
  });
}

/** Decimals matter for display/parsing amounts — worth fetching alongside name/symbol rather than assuming 18. */
export async function getErc20Metadata(
  client: PublicClient,
  token: Address,
): Promise<Erc20Metadata> {
  const [name, symbol, decimals] = await Promise.all([
    client.readContract({ address: token, abi: ERC20_ABI, functionName: "name" }),
    client.readContract({ address: token, abi: ERC20_ABI, functionName: "symbol" }),
    client.readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" }),
  ]);
  return { name, symbol, decimals };
}

/** Same idea as `transfer.ts#buildNativeTransfer`, but the call target is the token contract and the value moves through `data`, not `value`. */
export function buildErc20Transfer(
  client: PublicClient,
  params: Erc20TransferParams,
): Promise<TransactionSerializableEIP1559> {
  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [params.to, params.amount],
  });
  return buildTransaction(client, { from: params.from, to: params.token, data });
}
