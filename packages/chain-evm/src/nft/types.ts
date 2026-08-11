import type { Address } from "viem";

/**
 * The two non-fungible standards worth distinguishing: they differ in
 * ownership model (one owner vs. a balance per id), in how metadata is
 * addressed (`tokenURI` vs. a shared `uri` template), and in transfer
 * signature. Everything downstream branches on this, so it's detected once
 * via ERC-165 rather than inferred from which call happens to revert.
 */
export const NftStandard = {
  Erc721: "erc721",
  Erc1155: "erc1155",
} as const;
export type NftStandard = (typeof NftStandard)[keyof typeof NftStandard];

/** ERC-165 interface ids, from each standard's own specification. */
export const ERC721_INTERFACE_ID = "0x80ac58cd";
export const ERC1155_INTERFACE_ID = "0xd9b67a26";

/**
 * What identifies one NFT anywhere in this wallet: a contract plus a token
 * id. `tokenId` is a `bigint` because ids are `uint256` and routinely exceed
 * `Number.MAX_SAFE_INTEGER` — a token id silently rounded through a JS number
 * addresses a different token, which is the kind of bug that transfers an
 * asset to nobody.
 */
export interface NftRef {
  readonly contract: Address;
  readonly tokenId: bigint;
}

/**
 * The parts of ERC-721/1155 metadata JSON this wallet displays. Everything is
 * optional: metadata is off-chain, frequently missing, and often malformed,
 * so a partial render beats failing the whole list because one token's JSON
 * lacked a name.
 */
export interface NftMetadata {
  readonly name: string | null;
  readonly description: string | null;
  /** Already resolved to something a browser can load — `ipfs://` is rewritten to a gateway URL. */
  readonly imageUrl: string | null;
  readonly attributes: readonly NftAttribute[];
}

export interface NftAttribute {
  readonly trait: string;
  readonly value: string;
}

/** One NFT an account holds, as the UI needs it. */
export interface NftItem {
  readonly standard: NftStandard;
  readonly contract: Address;
  readonly tokenId: bigint;
  /** Collection name from the contract, when it exposes one. */
  readonly collection: string | null;
  /** How many the account holds. Always 1n for ERC-721. */
  readonly balance: bigint;
  readonly metadata: NftMetadata;
}

export interface NftTransferParams {
  readonly standard: NftStandard;
  readonly contract: Address;
  readonly tokenId: bigint;
  readonly from: Address;
  readonly to: Address;
  /** ERC-1155 only: how many to send. Ignored for ERC-721, which is always one. */
  readonly amount?: bigint;
}
