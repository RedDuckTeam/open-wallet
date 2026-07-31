import { createPublicClient, http, type Chain, type PublicClient } from "viem";

/** A read/broadcast RPC client for one EVM chain. No wallet/account state — signing stays in `sign.ts`. */
export function createEvmClient(rpcUrl: string, chain: Chain): PublicClient {
  return createPublicClient({ chain, transport: http(rpcUrl) });
}
