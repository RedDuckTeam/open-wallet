import type { Address, PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { getNftBalance, getNftOwner } from "../../src/nft/read.js";
import { detectNftStandard } from "../../src/nft/standard.js";
import { ERC1155_INTERFACE_ID, ERC721_INTERFACE_ID, NftStandard } from "../../src/nft/types.js";

const CONTRACT: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const OWNER: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const OTHER: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function mockClient(readContract: ReturnType<typeof vi.fn>): PublicClient {
  return { readContract } as unknown as PublicClient;
}

// supportsInterface answers true only for the ids listed.
function supporting(...ids: string[]): ReturnType<typeof vi.fn> {
  return vi.fn((args: { functionName: string; args?: readonly unknown[] }) =>
    Promise.resolve(ids.includes(String(args.args?.[0]))),
  );
}

describe("detectNftStandard", () => {
  it("identifies ERC-721 from its interface id", async () => {
    await expect(
      detectNftStandard(mockClient(supporting(ERC721_INTERFACE_ID)), CONTRACT),
    ).resolves.toBe(NftStandard.Erc721);
  });

  it("identifies ERC-1155 from its interface id", async () => {
    await expect(
      detectNftStandard(mockClient(supporting(ERC1155_INTERFACE_ID)), CONTRACT),
    ).resolves.toBe(NftStandard.Erc1155);
  });

  it("reports null for a contract claiming neither, rather than guessing", async () => {
    // Guessing ERC-721 here would build a transfer with the wrong signature.
    await expect(detectNftStandard(mockClient(supporting()), CONTRACT)).resolves.toBeNull();
  });

  it("reports null when the contract has no ERC-165 at all", async () => {
    const readContract = vi.fn().mockRejectedValue(new Error("execution reverted"));

    await expect(detectNftStandard(mockClient(readContract), CONTRACT)).resolves.toBeNull();
  });
});

describe("getNftBalance", () => {
  it("reads a real balance for ERC-1155", async () => {
    const readContract = vi.fn().mockResolvedValue(5n);

    await expect(
      getNftBalance(mockClient(readContract), NftStandard.Erc1155, CONTRACT, 7n, OWNER),
    ).resolves.toBe(5n);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "balanceOf", args: [OWNER, 7n] }),
    );
  });

  it("turns ERC-721 ownership into 1", async () => {
    const readContract = vi.fn().mockResolvedValue(OWNER);

    await expect(
      getNftBalance(mockClient(readContract), NftStandard.Erc721, CONTRACT, 1n, OWNER),
    ).resolves.toBe(1n);
  });

  it("turns someone else's ERC-721 into 0", async () => {
    const readContract = vi.fn().mockResolvedValue(OTHER);

    await expect(
      getNftBalance(mockClient(readContract), NftStandard.Erc721, CONTRACT, 1n, OWNER),
    ).resolves.toBe(0n);
  });

  it("compares owners case-insensitively", async () => {
    // ownerOf's casing is not guaranteed to match the caller's address.
    const readContract = vi.fn().mockResolvedValue(OWNER.toLowerCase());

    await expect(
      getNftBalance(mockClient(readContract), NftStandard.Erc721, CONTRACT, 1n, OWNER),
    ).resolves.toBe(1n);
  });

  it("treats a reverting ownerOf as 'you don't hold it'", async () => {
    // Burned or never minted — a real answer, not a failure.
    const readContract = vi.fn().mockRejectedValue(new Error("nonexistent token"));

    await expect(
      getNftBalance(mockClient(readContract), NftStandard.Erc721, CONTRACT, 1n, OWNER),
    ).resolves.toBe(0n);
  });
});

describe("getNftOwner", () => {
  it("returns null for a token that doesn't exist", async () => {
    const readContract = vi.fn().mockRejectedValue(new Error("nonexistent token"));

    await expect(getNftOwner(mockClient(readContract), CONTRACT, 1n)).resolves.toBeNull();
  });
});
