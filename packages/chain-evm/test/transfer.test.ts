import type { Address, PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { broadcastTransaction, buildNativeTransfer } from "../src/transfer.js";

const FROM: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const TO: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function mockClient(overrides: Partial<PublicClient> = {}): PublicClient {
  return {
    getTransactionCount: vi.fn().mockResolvedValue(7),
    estimateFeesPerGas: vi.fn().mockResolvedValue({
      maxFeePerGas: 30_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    }),
    estimateGas: vi.fn().mockResolvedValue(21_000n),
    getChainId: vi.fn().mockResolvedValue(1),
    sendRawTransaction: vi.fn().mockResolvedValue("0xhash"),
    ...overrides,
  } as unknown as PublicClient;
}

describe("buildNativeTransfer", () => {
  it("assembles an EIP-1559 transfer from the client's own estimates", async () => {
    const client = mockClient();
    const tx = await buildNativeTransfer(client, { from: FROM, to: TO, value: 1_000n });

    expect(tx).toEqual({
      type: "eip1559",
      chainId: 1,
      nonce: 7,
      to: TO,
      value: 1_000n,
      gas: 21_000n,
      maxFeePerGas: 30_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    });
    expect(client.getTransactionCount).toHaveBeenCalledWith({ address: FROM, blockTag: "pending" });
    expect(client.estimateGas).toHaveBeenCalledWith({ account: FROM, to: TO, value: 1_000n });
  });
});

describe("broadcastTransaction", () => {
  it("forwards the serialized transaction to sendRawTransaction", async () => {
    const client = mockClient();
    const hash = await broadcastTransaction(client, "0xdeadbeef");
    expect(client.sendRawTransaction).toHaveBeenCalledWith({ serializedTransaction: "0xdeadbeef" });
    expect(hash).toBe("0xhash");
  });
});
