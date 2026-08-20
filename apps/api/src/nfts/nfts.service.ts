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
  /**
   * Resolved once at construction — the choice depends only on environment,
   * and resolving it per request would defer a configuration mistake to the
   * first user instead of failing the deployment at startup, where the
   * operator who made the typo is still looking.
   */
  readonly #indexer: NftIndexer | null;

  constructor(
    config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    this.#indexer = resolveIndexer(
      config.get<string>("NFT_INDEXER") ?? "",
      config.get<string>("ALCHEMY_API_KEY") ?? "",
    );
  }

  async list(
    chainId: number,
    owner: string,
    limit: number,
    cursor?: string,
  ): Promise<NftListResponse> {
    const indexer = this.#indexer;
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

/**
 * Picks the indexer for this deployment.
 *
 * The default is deliberately *not* "none": Blockscout needs no key, so a
 * self-hosted API answers NFT queries out of the box, and configuring Alchemy
 * is an upgrade (spam filtering, higher limits) rather than a prerequisite.
 * `NFT_INDEXER=none` turns the capability off entirely for an operator who
 * doesn't want the API talking to a third party at all.
 *
 * Misconfiguration throws instead of degrading: an unrecognised name, or
 * `alchemy` requested with no key, used to fall back silently — which turns
 * a one-character typo into "NFTs mysteriously stopped being indexed" with
 * nothing in the logs to say why.
 */
export function resolveIndexer(kind: string, alchemyKey: string): NftIndexer | null {
  switch (kind) {
    case "none":
      return null;
    case "blockscout":
      return createBlockscoutIndexer();
    case "alchemy":
      if (!alchemyKey) {
        throw new Error("NFT_INDEXER=alchemy requires ALCHEMY_API_KEY to be set");
      }
      return createAlchemyIndexer(alchemyKey);
    case "":
      return alchemyKey ? createAlchemyIndexer(alchemyKey) : createBlockscoutIndexer();
    default:
      throw new Error(`Unknown NFT_INDEXER "${kind}" — expected "alchemy", "blockscout" or "none"`);
  }
}
