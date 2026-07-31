import type { Connection, PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { getNativeBalance } from "../src/balance.js";

describe("getNativeBalance", () => {
  it("returns the connection's reported lamport balance", async () => {
    const getBalance = vi.fn().mockResolvedValue(42);
    const connection = { getBalance } as unknown as Connection;
    const address = {} as PublicKey;

    await expect(getNativeBalance(connection, address)).resolves.toBe(42n);
    expect(getBalance).toHaveBeenCalledWith(address);
  });
});
