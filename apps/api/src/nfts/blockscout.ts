import type { NftInfo } from "@openwallet/api-contract";
import { getJson } from "../common/http.js";
import type { NftIndexer, NftPage } from "./indexer.js";

/**
 * Blockscout's public API — the keyless option.
 *
 * Blockscout is open source and runs public instances for most EVM chains, so
 * this is the one indexer that works with no account, no key and no billing
 * relationship. That matters for a wallet anyone can self-host: the
 * alternative is that NFT listing simply doesn't work until the operator signs
 * up with a vendor.
 *
 * The tradeoff against a commercial indexer is real and worth stating: no spam
 * filtering. Blockscout reports what the chain says you own, which includes
 * every scam airdrop sent to you.
 *
 * Hosts verified against the live API; chains that redirect or 404 are simply
 * absent rather than guessed at.
 */
const HOSTS: Readonly<Record<number, string>> = {
  1: "eth",
  8453: "base",
  42161: "arbitrum",
  137: "polygon",
  11155111: "eth-sepolia",
  84532: "base-sepolia",
};

interface BlockscoutNft {
  readonly id?: string;
  readonly value?: string;
  readonly token_type?: string;
  readonly image_url?: string | null;
  readonly media_url?: string | null;
  readonly token?: { readonly address_hash?: string; readonly name?: string | null };
  readonly metadata?: {
    readonly name?: unknown;
    readonly description?: unknown;
    readonly image?: unknown;
  } | null;
}

interface BlockscoutResponse {
  readonly items?: readonly BlockscoutNft[];
  /**
   * Blockscout paginates with a bag of fields rather than a single token, so
   * it's JSON-encoded into the opaque cursor the contract already defines
   * instead of leaking its shape through the wire.
   */
  readonly next_page_params?: Record<string, unknown> | null;
}

export function createBlockscoutIndexer(): NftIndexer {
  return {
    id: "blockscout",
    supportsChain: (chainId) => chainId in HOSTS,
    async fetchNfts(chainId, owner, _limit, cursor): Promise<NftPage> {
      const host = HOSTS[chainId];
      if (!host) return { nfts: [], nextCursor: null };

      const url = new URL(`https://${host}.blockscout.com/api/v2/addresses/${owner}/nft`);
      url.searchParams.set("type", "ERC-721,ERC-1155");
      for (const [key, value] of Object.entries(decodeCursor(cursor))) {
        url.searchParams.set(key, String(value));
      }

      const body = (await getJson(url)) as BlockscoutResponse;
      // Deliberately NOT sliced to `limit`: Blockscout paginates in its own
      // fixed pages and the cursor it returns points past the WHOLE page, so
      // trimming here would silently drop every item between `limit` and the
      // page end — the client would never see them on any page. `limit` is a
      // hint this vendor can't honour; the contract's cap (100) is above the
      // vendor's page size, so the response still fits it.
      return {
        nfts: (body.items ?? []).flatMap((item) => toNftInfo(chainId, item)),
        nextCursor: body.next_page_params ? encodeCursor(body.next_page_params) : null,
      };
    },
  };
}

function encodeCursor(params: Record<string, unknown>): string {
  return JSON.stringify(params);
}

function decodeCursor(cursor: string | undefined): Record<string, unknown> {
  if (!cursor) return {};
  try {
    const parsed: unknown = JSON.parse(cursor);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    // A cursor we didn't issue just starts the listing over, which is a better
    // outcome than a 500 on a malformed query string.
    return {};
  }
}

/** Returns an array so `flatMap` drops a malformed record instead of failing the whole page. */
export function toNftInfo(chainId: number, item: BlockscoutNft): NftInfo[] {
  const contract = item.token?.address_hash;
  const tokenId = item.id;
  if (!contract || tokenId === undefined) return [];
  return [
    {
      chainId,
      contract: contract.toLowerCase(),
      tokenId,
      standard: item.token_type === "ERC-1155" ? "erc1155" : "erc721",
      name: asString(item.metadata?.name),
      collection: item.token?.name ?? null,
      description: asString(item.metadata?.description),
      // `image_url` is Blockscout's own resolved/proxied URL; the raw metadata
      // `image` is the fallback and may still be an ipfs:// URI, which the
      // extension resolves.
      imageUrl: item.image_url ?? item.media_url ?? asString(item.metadata?.image),
      balance: item.value ?? "1",
    },
  ];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
