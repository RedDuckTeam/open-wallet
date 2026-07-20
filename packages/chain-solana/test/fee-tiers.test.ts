import type { Connection } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { getFeeTiers } from "../src/fee-tiers.js";

function mockConnection(fees: number[]): {
  connection: Connection;
  getRecentPrioritizationFees: ReturnType<typeof vi.fn>;
} {
  const getRecentPrioritizationFees = vi
    .fn()
    .mockResolvedValue(fees.map((prioritizationFee, slot) => ({ slot, prioritizationFee })));
  const connection = { getRecentPrioritizationFees } as unknown as Connection;
  return { connection, getRecentPrioritizationFees };
}

describe("getFeeTiers", () => {
  it("returns the 25th/50th/75th percentile of recent fees", async () => {
    const { connection } = mockConnection([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
    const tiers = await getFeeTiers(connection);
    expect(tiers).toEqual({ slow: 300, average: 600, fast: 800 });
  });

  it("returns zeros when there's no recent fee history", async () => {
    const { connection } = mockConnection([]);
    await expect(getFeeTiers(connection)).resolves.toEqual({ slow: 0, average: 0, fast: 0 });
  });

  it("omits lockedWritableAccounts from the RPC call when none are given", async () => {
    const { connection, getRecentPrioritizationFees } = mockConnection([100]);
    await getFeeTiers(connection);
    expect(getRecentPrioritizationFees).toHaveBeenCalledWith(undefined);
  });

  it("scopes the estimate to the given accounts when provided", async () => {
    const { connection, getRecentPrioritizationFees } = mockConnection([100]);
    const account = Keypair.generate().publicKey;

    await getFeeTiers(connection, [account]);

    expect(getRecentPrioritizationFees).toHaveBeenCalledWith({ lockedWritableAccounts: [account] });
  });
});
