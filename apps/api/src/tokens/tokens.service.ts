import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { Cache } from "cache-manager";
import type { SolanaTokenInfo, TokenInfo } from "@openwallet/api-contract";
import { fetchLifiTokens, searchTokens } from "@openwallet/lifi-client";
import { searchJupiterTokens } from "@openwallet/jupiter-client";
import { cached } from "../common/cache.js";

// Token registries change slowly; cache a chain's list for an hour so the popup
// never waits on LI.FI and the (optional) API key isn't spent per keystroke.
const TTL_MS = 60 * 60 * 1000;

@Injectable()
export class TokensService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly config: ConfigService,
  ) {}

  async list(chainId: number): Promise<TokenInfo[]> {
    return cached(this.cache, `tokens:${String(chainId)}`, TTL_MS, () =>
      fetchLifiTokens(chainId, this.config.get<string>("LIFI_API_KEY") ?? ""),
    );
  }

  async search(chainId: number, query: string, limit: number): Promise<TokenInfo[]> {
    return searchTokens(await this.list(chainId), query, limit);
  }

  // Jupiter ranks server-side already, unlike LI.FI's flat per-chain list —
  // no local cache/ranking layer needed on top.
  searchSolana(query: string, limit: number): Promise<SolanaTokenInfo[]> {
    return searchJupiterTokens(query, limit);
  }
}
