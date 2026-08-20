import { z } from "zod";

// One NFT an address holds, flattened out of whatever the upstream indexer
// returns. `tokenId` is a decimal *string*, not a number: ids are uint256 and
// routinely exceed Number.MAX_SAFE_INTEGER, and a rounded id addresses a
// different token. Same reason balances cross this boundary as strings.
export const NftInfo = z.object({
  chainId: z.number().int(),
  contract: z.string(),
  tokenId: z.string(),
  standard: z.enum(["erc721", "erc1155"]),
  name: z.string().nullable(),
  collection: z.string().nullable(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  balance: z.string(),
});
export type NftInfo = z.infer<typeof NftInfo>;

export const NftListResponse = z.object({
  nfts: z.array(NftInfo),
  // Opaque cursor for the next page, or null at the end. Passed back verbatim.
  nextCursor: z.string().nullable(),
  // False when no indexer is configured, so the extension can say "listing
  // unavailable, add NFTs manually" instead of showing an empty collection —
  // an empty list and an absent indexer look identical otherwise.
  indexed: z.boolean(),
});
export type NftListResponse = z.infer<typeof NftListResponse>;

export const NftListQuery = z.object({
  chainId: z.coerce.number().int().positive(),
  owner: z.string().min(1),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
