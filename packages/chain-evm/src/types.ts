import type { Address, Hex } from "viem";

export interface NativeTransferParams {
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
}

export interface ReplacementFees {
  readonly maxFeePerGas: bigint;
  readonly maxPriorityFeePerGas: bigint;
}

export interface SpeedUpTransferParams extends ReplacementFees {
  readonly chainId: number;
  /** Must match the pending transaction's nonce exactly — that's what makes this a replacement instead of a new transaction. */
  readonly nonce: number;
  readonly to: Address;
  readonly value: bigint;
  readonly data?: Hex;
  readonly gas: bigint;
  readonly originalFees: ReplacementFees;
}

export interface CancelTransferParams extends ReplacementFees {
  readonly chainId: number;
  readonly from: Address;
  readonly nonce: number;
  readonly originalFees: ReplacementFees;
}

export interface Erc20Metadata {
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
}

export interface Erc20TransferParams {
  readonly token: Address;
  readonly from: Address;
  readonly to: Address;
  /** In the token's base units (respecting its `decimals`), same convention as `buildNativeTransfer`'s wei. */
  readonly amount: bigint;
}

export interface FeeEstimate {
  readonly maxFeePerGas: bigint;
  readonly maxPriorityFeePerGas: bigint;
}

export interface FeeTiers {
  readonly slow: FeeEstimate;
  readonly average: FeeEstimate;
  readonly fast: FeeEstimate;
}
