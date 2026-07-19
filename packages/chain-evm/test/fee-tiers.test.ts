import type { PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { getFeeTiers } from "../src/fee-tiers.js";

function mockClient(baseFeePerGas: bigint | null, priorityFee: bigint): PublicClient {
  return {
    getBlock: vi.fn().mockResolvedValue({ baseFeePerGas }),
    estimateMaxPriorityFeePerGas: vi.fn().mockResolvedValue(priorityFee),
  } as unknown as PublicClient;
}

describe("getFeeTiers", () => {
  it("scales base fee and priority fee per tier, average matching viem's own 1.2x default", async () => {
    const client = mockClient(10_000_000_000n, 1_000_000_000n);

    const tiers = await getFeeTiers(client);

    expect(tiers).toEqual({
      slow: { maxFeePerGas: 11_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n },
      average: { maxFeePerGas: 13_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n },
      fast: { maxFeePerGas: 21_500_000_000n, maxPriorityFeePerGas: 1_500_000_000n },
    });
  });

  it("fetches the block and priority fee in parallel", async () => {
    const client = mockClient(10_000_000_000n, 1_000_000_000n);
    await getFeeTiers(client);

    expect(client.getBlock).toHaveBeenCalledTimes(1);
    expect(client.estimateMaxPriorityFeePerGas).toHaveBeenCalledTimes(1);
  });

  it("throws on a pre-EIP-1559 chain (no baseFeePerGas)", async () => {
    const client = mockClient(null, 1_000_000_000n);
    await expect(getFeeTiers(client)).rejects.toThrow(/EIP-1559/);
  });
});
