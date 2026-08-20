import { createEvmClient } from "@openwallet/chain-evm";
import { RpcRequestError } from "viem";
import { RPC_ERROR, providerError } from "../../dapp/messages.js";
import type { EvmNetwork } from "../../config/networks.js";

// Forwards a dApp-supplied JSON-RPC method we don't otherwise route (reads
// only — routeOf/ROUTES in rpc-router.ts must keep anything state-changing
// off this path) to the network's own RPC, through the same client the rest
// of the codebase uses rather than a second hand-rolled HTTP call.
export async function passthrough(
  network: EvmNetwork,
  method: string,
  params: unknown,
): Promise<unknown> {
  const client = createEvmClient(network.rpcUrl, network.chain);
  try {
    return await client.request({ method, params: params ?? [] } as Parameters<
      typeof client.request
    >[0]);
  } catch (error) {
    if (error instanceof RpcRequestError) {
      throw providerError(error.code, error.shortMessage);
    }
    throw providerError(RPC_ERROR.Internal, "RPC error");
  }
}
