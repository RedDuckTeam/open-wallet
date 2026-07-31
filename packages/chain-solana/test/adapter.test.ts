import type { Connection } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { createSolanaAdapter } from "../src/adapter.js";

describe("createSolanaAdapter", () => {
  it("rejects a transfer amount above Number.MAX_SAFE_INTEGER instead of silently rounding", async () => {
    const getLatestBlockhash = vi.fn();
    const connection = {
      getLatestBlockhash,
      sendRawTransaction: vi.fn(),
    } as unknown as Connection;
    const adapter = createSolanaAdapter(connection);
    const from = Keypair.generate().publicKey.toBase58();
    const to = Keypair.generate().publicKey.toBase58();

    await expect(adapter.buildTransfer({ from, to, amount: 2n ** 53n })).rejects.toThrow(
      RangeError,
    );
    expect(getLatestBlockhash).not.toHaveBeenCalled();
  });
});
