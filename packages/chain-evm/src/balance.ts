import type { Address, PublicClient } from "viem";

/** Native currency balance (wei) for an address. */
export async function getNativeBalance(client: PublicClient, address: Address): Promise<bigint> {
  return client.getBalance({ address });
}
