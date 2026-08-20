import {
  encodeFunctionData,
  type Hex,
  type PublicClient,
  type TransactionSerializableEIP1559,
} from "viem";
import { ERC1155_ABI, ERC721_ABI } from "../abi.js";
import { buildTransaction } from "../transfer.js";
import { NftStandard, type NftTransferParams } from "./types.js";

/**
 * Calldata for moving an NFT, per standard.
 *
 * Both standards use `safeTransferFrom` rather than `transferFrom`: the safe
 * variant calls the receiver's `onERC721Received`/`onERC1155Received` hook and
 * reverts if a contract can't acknowledge it. That's the difference between a
 * failed transfer and an NFT permanently stuck in a contract that has no way
 * to move it again.
 *
 * Exposed separately from `buildNftTransfer` because a smart account executes
 * calldata directly (ERC-4337 batches, an EIP-6551 account acting for its
 * NFT) and never wants a wrapped EIP-1559 transaction.
 */
export function encodeNftTransfer(params: NftTransferParams): Hex {
  if (params.standard === NftStandard.Erc721) {
    return encodeFunctionData({
      abi: ERC721_ABI,
      functionName: "safeTransferFrom",
      args: [params.from, params.to, params.tokenId],
    });
  }
  return encodeFunctionData({
    abi: ERC1155_ABI,
    functionName: "safeTransferFrom",
    // ERC-1155 is quantity-bearing; one is the sane default for a wallet UI,
    // and `data` is empty because this is a plain transfer with nothing to
    // forward to the receiver hook.
    args: [params.from, params.to, params.tokenId, params.amount ?? 1n, "0x"],
  });
}

/** Same shape as `buildErc20Transfer`: the call targets the token contract, and nothing moves through `value`. */
export function buildNftTransfer(
  client: PublicClient,
  params: NftTransferParams,
): Promise<TransactionSerializableEIP1559> {
  return buildTransaction(client, {
    from: params.from,
    to: params.contract,
    data: encodeNftTransfer(params),
  });
}
