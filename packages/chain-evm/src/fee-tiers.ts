import type { PublicClient } from "viem";
import type { FeeEstimate, FeeTiers } from "./types.js";

type FeeSpeed = "slow" | "average" | "fast";

/**
 * `average` mirrors viem's own `estimateFeesPerGas` default (its
 * `baseFeeMultiplier` is 1.2 — see viem's `internal_estimateFeesPerGas`),
 * so it lines up with what `buildNativeTransfer`/`buildErc20Transfer`
 * already produce. `slow`/`fast` scale from there, the same three-speed
 * choice every major wallet presents. `satisfies` checks each map has
 * exactly the three `FeeSpeed` keys without widening the values to
 * `number` the way an explicit `: Record<FeeSpeed, number>` annotation
 * would — `scale` below still gets the literal `1.2`, not just `number`.
 */
const BASE_FEE_MULTIPLIER = {
  slow: 1,
  average: 1.2,
  fast: 2,
} as const satisfies Record<FeeSpeed, number>;
const PRIORITY_FEE_MULTIPLIER = {
  slow: 1,
  average: 1,
  fast: 1.5,
} as const satisfies Record<FeeSpeed, number>;

/** Every multiplier above has at most one decimal place, so scaling by 10 and dividing back keeps this exact instead of floating-point-lossy — the same trick viem's own fee estimation uses. */
function scale(value: bigint, multiplier: number): bigint {
  return (value * BigInt(Math.round(multiplier * 10))) / 10n;
}

/**
 * Three fee presets (slow/average/fast) for an EIP-1559 transaction, built
 * from the chain's own current base fee and priority fee estimate — no
 * third-party fee API involved, matching the rest of this package's "just
 * an unopinionated RPC call" scope. Throws if the chain doesn't support
 * EIP-1559 (`baseFeePerGas` missing from the latest block), the same
 * condition `client.estimateFeesPerGas()` itself rejects on.
 */
export async function getFeeTiers(client: PublicClient): Promise<FeeTiers> {
  const [block, priorityFee] = await Promise.all([
    client.getBlock(),
    client.estimateMaxPriorityFeePerGas(),
  ]);
  const baseFee = block.baseFeePerGas;
  if (baseFee === null) {
    throw new Error("Chain does not support EIP-1559 fees (no baseFeePerGas on the latest block)");
  }

  const tier = (speed: FeeSpeed): FeeEstimate => {
    const maxPriorityFeePerGas = scale(priorityFee, PRIORITY_FEE_MULTIPLIER[speed]);
    const maxFeePerGas = scale(baseFee, BASE_FEE_MULTIPLIER[speed]) + maxPriorityFeePerGas;
    return { maxFeePerGas, maxPriorityFeePerGas };
  };

  return { slow: tier("slow"), average: tier("average"), fast: tier("fast") };
}
