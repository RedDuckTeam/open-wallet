import type { PublicKey } from "@solana/web3.js";

export interface NativeTransferParams {
  readonly from: PublicKey;
  readonly to: PublicKey;
  readonly lamports: number;
}

export interface SplTransferParams {
  readonly mint: PublicKey;
  readonly from: PublicKey;
  readonly to: PublicKey;
  /** In the token's base units, same convention as `chain-evm`'s ERC-20 transfer. */
  readonly amount: bigint;
}

/** Suggested priority fee per tier, in micro-lamports per compute unit — the unit `getRecentPrioritizationFees` and `ComputeBudgetProgram.setComputeUnitPrice` both use. */
export interface FeeTiers {
  readonly slow: number;
  readonly average: number;
  readonly fast: number;
}
