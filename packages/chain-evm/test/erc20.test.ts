import type { Address, PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { buildErc20Transfer, getErc20Balance, getErc20Metadata } from "../src/erc20.js";

const TOKEN: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const OWNER: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const TO: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function mockClient(readContract: ReturnType<typeof vi.fn>): PublicClient {
  return {
    readContract,
    getTransactionCount: vi.fn().mockResolvedValue(3),
    estimateFeesPerGas: vi.fn().mockResolvedValue({
      maxFeePerGas: 30_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    }),
    estimateGas: vi.fn().mockResolvedValue(60_000n),
    getChainId: vi.fn().mockResolvedValue(1),
  } as unknown as PublicClient;
}

describe("getErc20Balance", () => {
  it("reads balanceOf and returns it as-is", async () => {
    const readContract = vi.fn().mockResolvedValue(123_000_000n);
    const client = mockClient(readContract);

    await expect(getErc20Balance(client, TOKEN, OWNER)).resolves.toBe(123_000_000n);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: TOKEN, functionName: "balanceOf", args: [OWNER] }),
    );
  });
});

describe("getErc20Metadata", () => {
  it("reads name, symbol, and decimals", async () => {
    const readContract = vi
      .fn()
      .mockResolvedValueOnce("USD Coin")
      .mockResolvedValueOnce("USDC")
      .mockResolvedValueOnce(6);
    const client = mockClient(readContract);

    await expect(getErc20Metadata(client, TOKEN)).resolves.toEqual({
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
    });
  });
});

describe("buildErc20Transfer", () => {
  it("targets the token contract with an encoded transfer() call, not the native value field", async () => {
    const client = mockClient(vi.fn());

    const tx = await buildErc20Transfer(client, {
      token: TOKEN,
      from: OWNER,
      to: TO,
      amount: 1_000_000n,
    });

    expect(tx.to).toBe(TOKEN);
    expect(tx.value).toBe(0n);
    expect(tx.data).toMatch(/^0xa9059cbb/); // transfer(address,uint256) selector
    expect(tx.chainId).toBe(1);
    expect(tx.nonce).toBe(3);
    expect(tx.gas).toBe(60_000n);
  });
});
