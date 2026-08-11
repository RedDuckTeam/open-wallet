import { Inject, Injectable } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { ConfigService } from "@nestjs/config";
import type { Cache } from "cache-manager";
import type { NftListResponse } from "@openwallet/api-contract";
import { cached } from "../common/cache.js";
import { createAlchemyIndexer } from "./alchemy.js";
import { createBlockscoutIndexer } from "./blockscout.js";
import type { NftIndexer } from "./indexer.js";

// NFT holdings move rarely compared to prices, but a user who just received or
// sent one expects the list to reflect it fairly soon. A minute is the
// compromise, and it also absorbs the repeated calls a popup makes as the user
// moves between screens.
const TTL_MS = 60_000;

@Injectable()
export class NftsService {
  constructor(
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Picks the indexer for this deployment.
   *
   * The default is deliberately *not* "none": Blockscout needs no key, so a
   * self-hosted API answers NFT queries out of the box, and configuring
   * Alchemy is an upgrade (spam filtering, higher limits) rather than a
   * prerequisite. `NFT_INDEXER=none` turns the capability off entirely for an
   * operator who doesn't want the API talking to a third party at all.
   */
  #indexer(): NftIndexer | null {
    const apiKey = this.config.get<string>("ALCHEMY_API_KEY") ?? "";
    switch (this.config.get<string>("NFT_INDEXER") ?? "") {
      case "none":
        return null;
      case "blockscout":
        return createBlockscoutIndexer();
      case "alchemy":
        return apiKey ? createAlchemyIndexer(apiKey) : null;
      default:
        return apiKey ? createAlchemyIndexer(apiKey) : createBlockscoutIndexer();
    }
  }

  async list(
    chainId: number,
    owner: string,
    limit: number,
    cursor?: string,
  ): Promise<NftListResponse> {
    const indexer = this.#indexer();
    // `indexed: false` rather than an empty list: with no indexer there is no
    // way to enumerate holdings, and an empty array would read as "you own no
    // NFTs" — a wrong answer rather than an absent one.
    if (!indexer?.supportsChain(chainId)) {
      return { nfts: [], nextCursor: null, indexed: false };
    }

    const key = `nfts:${indexer.id}:${String(chainId)}:${owner.toLowerCase()}:${String(limit)}:${cursor ?? ""}`;
    const page = await cached(this.cache, key, TTL_MS, () =>
      indexer.fetchNfts(chainId, owner, limit, cursor),
    );
    return { ...page, indexed: true };
  }
}
