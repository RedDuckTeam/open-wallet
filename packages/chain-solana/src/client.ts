import { Connection, type Commitment } from "@solana/web3.js";
import { DEFAULT_COMMITMENT } from "./constants.js";

/** A read/broadcast RPC connection for one Solana cluster. No wallet/account state — signing stays in `sign.ts`. */
export function createSolanaClient(
  rpcUrl: string,
  commitment: Commitment = DEFAULT_COMMITMENT,
): Connection {
  return new Connection(rpcUrl, commitment);
}
