import { parseAbi } from "viem";

/** The subset of ERC-20 (EIP-20) this package actually calls: balance/metadata reads and a transfer. */
export const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

/**
 * ERC-165 interface detection — the standard way to ask a contract which
 * token standard it implements, instead of guessing from which call reverts.
 */
export const ERC165_ABI = parseAbi([
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
]);

/** The subset of ERC-721 this package calls: ownership, metadata, and a safe transfer. */
export const ERC721_ABI = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
]);

/**
 * The subset of ERC-1155 this package calls. Note `uri(uint256)` rather than
 * `tokenURI`: ERC-1155 returns one template for every id, with `{id}`
 * substituted by the caller (see `nft/metadata.ts`).
 */
export const ERC1155_ABI = parseAbi([
  "function balanceOf(address owner, uint256 id) view returns (uint256)",
  "function uri(uint256 id) view returns (string)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
]);
