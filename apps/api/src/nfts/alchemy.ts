import type { NftInfo } from "@openwallet/api-contract";
import { getJson } from "../common/http.js";
import type { NftIndexer, NftPage } from "./indexer.js";

/**
 * Alchemy's NFT API — the keyed option, and the same class of source MetaMask
 * uses for its own auto-detection.
 *
 * Worth a key over the keyless alternative for one reason above all: spam
 * filtering. Without it a listing is hundreds of scam airdrops with a few real
 * holdings buried among them.
 *
 * This is a REST indexer, not a JSON-RPC endpoint — using it here doesn't make
 * the API a node client, and a deployment already using Alchemy for the
 * *extension's* RPC still configures this separately, because they're
 * different products on different sides of the wire.
 */
/**
 * Alchemy's hostname for each chain they index — their naming convention,
 * not ours. "arb-mainnet" is not derivable from chain id 42161, a viem chain
 * object, or anything else in this codebase, so a lookup table is the honest
 * representation, exactly like the Trust Wallet folder map in the
 * extension's icons.ts. It doubles as the coverage list: `supportsChain`
 * answers from it, and a chain Alchemy doesn't index falls through to the
 * caller's fallback instead of a fabricated URL.
 */
const HOSTS: Readonly<Record<number, string>> = {
  1: "eth-mainnet",
  8453: "base-mainnet",
  42161: "arb-mainnet",
  10: "opt-mainnet",
  137: "polygon-mainnet",
  11155111: "eth-sepolia",
};

interface AlchemyNft {
  readonly contract?: { readonly address?: string; readonly name?: string };
  readonly tokenId?: string;
  readonly tokenType?: string;
  readonly name?: string;
  readonly description?: string;
  readonly image?: { readonly cachedUrl?: string; readonly originalUrl?: string };
  readonly balance?: string;
}

interface AlchemyResponse {
  readonly ownedNfts?: readonly AlchemyNft[];
  readonly pageKey?: string;
}

export function createAlchemyIndexer(apiKey: string): NftIndexer {
  return {
    id: "alchemy",
    supportsChain: (chainId) => chainId in HOSTS,
    async fetchNfts(chainId, owner, limit, cursor): Promise<NftPage> {
      const host = HOSTS[chainId];
      if (!host) return { nfts: [], nextCursor: null };

      const url = new URL(`https://${host}.g.alchemy.com/nft/v3/${apiKey}/getNFTsForOwner`);
      url.searchParams.set("owner", owner);
      url.searchParams.set("pageSize", String(limit));
      url.searchParams.set("withMetadata", "true");
      url.searchParams.append("excludeFilters[]", "SPAM");
      if (cursor) url.searchParams.set("pageKey", cursor);

      const body = (await getJson(url)) as AlchemyResponse;
      return {
        nfts: (body.ownedNfts ?? []).flatMap((nft) => toNftInfo(chainId, nft)),
        nextCursor: body.pageKey ?? null,
      };
    },
  };
}

/** Returns an array so `flatMap` drops a malformed record instead of failing the whole page. */
export function toNftInfo(chainId: number, nft: AlchemyNft): NftInfo[] {
  const contract = nft.contract?.address;
  const tokenId = nft.tokenId;
  if (!contract || tokenId === undefined) return [];
  return [
    {
      chainId,
      contract: contract.toLowerCase(),
      tokenId,
      standard: nft.tokenType === "ERC1155" ? "erc1155" : "erc721",
      name: nft.name ?? null,
      collection: nft.contract?.name ?? null,
      description: nft.description ?? null,
      imageUrl: nft.image?.cachedUrl ?? nft.image?.originalUrl ?? null,
      // ERC-721 is always one; only ERC-1155 carries a meaningful balance.
      balance: nft.balance ?? "1",
    },
  ];
}
