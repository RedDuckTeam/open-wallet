import type { TransactionSerializableEIP1559 } from "viem";
import { EVM_NATIVE_TRANSFER_GAS, MIN_REPLACEMENT_FEE_BUMP_PERCENT } from "./constants.js";
import { FeeTooLowError } from "./errors.js";
import type { ReplacementFees, SpeedUpTransferParams, CancelTransferParams } from "./types.js";

/** `minimum = original * (100 + bump) / 100`, matching go-ethereum's own threshold arithmetic exactly (see `MIN_REPLACEMENT_FEE_BUMP_PERCENT`). */
function minimumBumped(original: bigint): bigint {
  return (original * (100n + MIN_REPLACEMENT_FEE_BUMP_PERCENT)) / 100n;
}

function assertHigherFees(next: ReplacementFees, original: ReplacementFees): void {
  if (
    next.maxFeePerGas < minimumBumped(original.maxFeePerGas) ||
    next.maxPriorityFeePerGas < minimumBumped(original.maxPriorityFeePerGas)
  ) {
    throw new FeeTooLowError(
      `A replacement transaction must pay at least ${String(MIN_REPLACEMENT_FEE_BUMP_PERCENT)}% more, on both maxFeePerGas and maxPriorityFeePerGas, than the one it replaces — not just any amount more — or nodes running the default mempool policy will reject it as underpriced`,
    );
  }
}

/**
 * "Speed up": the exact same transaction (`to`/`value`/`data`/`gas`) at the
 * same nonce, just with higher fees — a synchronous, pure function, since
 * everything it needs (the pending transaction's own fields) is something
 * the caller already has from building that transaction in the first
 * place, unlike `buildNativeTransfer` which has to fetch fresh state.
 */
export function speedUpTransfer(params: SpeedUpTransferParams): TransactionSerializableEIP1559 {
  assertHigherFees(params, params.originalFees);
  return {
    type: "eip1559",
    chainId: params.chainId,
    nonce: params.nonce,
    to: params.to,
    value: params.value,
    data: params.data,
    gas: params.gas,
    maxFeePerGas: params.maxFeePerGas,
    maxPriorityFeePerGas: params.maxPriorityFeePerGas,
  };
}

/** "Cancel": a zero-value transfer to yourself at the same nonce and higher fees — same mechanism as `speedUpTransfer`, just dropping the original payment instead of keeping it. */
export function cancelTransfer(params: CancelTransferParams): TransactionSerializableEIP1559 {
  assertHigherFees(params, params.originalFees);
  return {
    type: "eip1559",
    chainId: params.chainId,
    nonce: params.nonce,
    to: params.from,
    value: 0n,
    gas: EVM_NATIVE_TRANSFER_GAS,
    maxFeePerGas: params.maxFeePerGas,
    maxPriorityFeePerGas: params.maxPriorityFeePerGas,
  };
}
