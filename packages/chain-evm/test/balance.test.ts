import type { Address, PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { getNativeBalance } from "../src/balance.js";

const ADDRESS: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("getNativeBalance", () => {
  it("returns the client's reported balance for the address", async () => {
    const client = {
      getBalance: vi.fn().mockResolvedValue(123_456n),
    } as unknown as PublicClient;

    await expect(getNativeBalance(client, ADDRESS)).resolves.toBe(123_456n);
    expect(client.getBalance).toHaveBeenCalledWith({ address: ADDRESS });
  });
});
