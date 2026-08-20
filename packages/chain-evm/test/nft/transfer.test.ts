import { decodeFunctionData, type Address } from "viem";
import { describe, expect, it } from "vitest";
import { ERC1155_ABI, ERC721_ABI } from "../../src/abi.js";
import { encodeNftTransfer } from "../../src/nft/transfer.js";
import { NftStandard } from "../../src/nft/types.js";

const CONTRACT: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const FROM: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const TO: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

describe("encodeNftTransfer", () => {
  it("uses ERC-721's safeTransferFrom, so a contract receiver must acknowledge it", () => {
    const data = encodeNftTransfer({
      standard: NftStandard.Erc721,
      contract: CONTRACT,
      tokenId: 42n,
      from: FROM,
      to: TO,
    });

    expect(decodeFunctionData({ abi: ERC721_ABI, data })).toEqual({
      functionName: "safeTransferFrom",
      args: [FROM, TO, 42n],
    });
  });

  it("uses ERC-1155's quantity-bearing safeTransferFrom", () => {
    const data = encodeNftTransfer({
      standard: NftStandard.Erc1155,
      contract: CONTRACT,
      tokenId: 7n,
      from: FROM,
      to: TO,
      amount: 3n,
    });

    expect(decodeFunctionData({ abi: ERC1155_ABI, data })).toEqual({
      functionName: "safeTransferFrom",
      args: [FROM, TO, 7n, 3n, "0x"],
    });
  });

  it("defaults an ERC-1155 transfer to one", () => {
    const data = encodeNftTransfer({
      standard: NftStandard.Erc1155,
      contract: CONTRACT,
      tokenId: 7n,
      from: FROM,
      to: TO,
    });

    expect(decodeFunctionData({ abi: ERC1155_ABI, data }).args?.[3]).toBe(1n);
  });

  it("keeps a uint256 token id exact past Number.MAX_SAFE_INTEGER", () => {
    // Rounding a token id through a JS number addresses a different token.
    const tokenId = 2n ** 255n + 12345n;

    const data = encodeNftTransfer({
      standard: NftStandard.Erc721,
      contract: CONTRACT,
      tokenId,
      from: FROM,
      to: TO,
    });

    expect(decodeFunctionData({ abi: ERC721_ABI, data }).args?.[2]).toBe(tokenId);
  });
});
