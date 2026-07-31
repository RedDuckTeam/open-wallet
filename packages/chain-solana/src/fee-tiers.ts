import type { Connection, PublicKey } from "@solana/web3.js";
import type { FeeTiers } from "./types.js";

/**
 * Three priority-fee presets, taken as percentiles of the network's own
 * recent fee history — no third-party fee API, same "just an unopinionated
 * RPC call" scope as the rest of this package. Pass `writableAccounts` (the
 * accounts a transaction will actually write to) to scope the estimate to
 * their specific contention instead of the network-wide default — Solana's
 * own recommendation for `getRecentPrioritizationFees`.
 */
export async function getFeeTiers(
  connection: Connection,
  writableAccounts?: PublicKey[],
): Promise<FeeTiers> {
  const recentFees = await connection.getRecentPrioritizationFees(
    writableAccounts ? { lockedWritableAccounts: writableAccounts } : undefined,
  );
  const fees = recentFees.map((fee) => fee.prioritizationFee).sort((a, b) => a - b);
  if (fees.length === 0) {
    return { slow: 0, average: 0, fast: 0 };
  }

  return {
    slow: percentile(fees, 0.25),
    average: percentile(fees, 0.5),
    fast: percentile(fees, 0.75),
  };
}

function percentile(sortedValues: number[], p: number): number {
  const index = Math.min(sortedValues.length - 1, Math.floor(p * sortedValues.length));
  return sortedValues[index] ?? 0;
}
