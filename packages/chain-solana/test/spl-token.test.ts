import { Keypair, PublicKey, type Connection } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";

// Only `getAccount` (the network call) is mocked — `getAssociatedTokenAddress`,
// `createTransferInstruction`, and `createAssociatedTokenAccountInstruction`
// are pure/offline, so the test exercises the real instruction-building code.
const getAccountMock = vi.hoisted(() => vi.fn());

vi.mock("@solana/spl-token", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@solana/spl-token")>();
  return { ...actual, getAccount: getAccountMock };
});

const { TokenAccountNotFoundError } = await import("@solana/spl-token");
const { buildSplTransfer, getSplTokenBalance } = await import("../src/spl-token.js");

const FAKE_BLOCKHASH = PublicKey.default.toBase58();

function mockConnection(): Connection {
  return {
    getLatestBlockhash: vi
      .fn()
      .mockResolvedValue({ blockhash: FAKE_BLOCKHASH, lastValidBlockHeight: 100 }),
  } as unknown as Connection;
}

describe("getSplTokenBalance", () => {
  it("returns the token account's amount when it exists", async () => {
    getAccountMock.mockResolvedValueOnce({ amount: 4_200_000n });
    const balance = await getSplTokenBalance(
      mockConnection(),
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
    );
    expect(balance).toBe(4_200_000n);
  });

  it("returns 0 when the owner has never held this token", async () => {
    getAccountMock.mockRejectedValueOnce(new TokenAccountNotFoundError());
    const balance = await getSplTokenBalance(
      mockConnection(),
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
    );
    expect(balance).toBe(0n);
  });

  it("propagates any other error", async () => {
    getAccountMock.mockRejectedValueOnce(new Error("rpc down"));
    await expect(
      getSplTokenBalance(
        mockConnection(),
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
      ),
    ).rejects.toThrow("rpc down");
  });
});

describe("buildSplTransfer", () => {
  it("builds a single transfer instruction when the recipient's token account already exists", async () => {
    getAccountMock.mockResolvedValueOnce({ amount: 0n });

    const transaction = await buildSplTransfer(mockConnection(), {
      mint: Keypair.generate().publicKey,
      from: Keypair.generate().publicKey,
      to: Keypair.generate().publicKey,
      amount: 1_000n,
    });

    expect(transaction.instructions).toHaveLength(1);
  });

  it("prepends account creation when the recipient has never held this token", async () => {
    getAccountMock.mockRejectedValueOnce(new TokenAccountNotFoundError());

    const transaction = await buildSplTransfer(mockConnection(), {
      mint: Keypair.generate().publicKey,
      from: Keypair.generate().publicKey,
      to: Keypair.generate().publicKey,
      amount: 1_000n,
    });

    expect(transaction.instructions).toHaveLength(2);
  });
});
