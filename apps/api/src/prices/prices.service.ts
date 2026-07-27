import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { Cache } from "cache-manager";
import { cached } from "../common/cache.js";
import { fetchNativePrices, fetchTokenPrices } from "./coingecko.js";

// Short TTL: prices are live data, but a shared server cache keeps CoinGecko's
// free tier from rate-limiting when many clients poll at once.
const TTL_MS = 60 * 1000;

@Injectable()
export class PricesService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly config: ConfigService,
  ) {}

  async native(ids: readonly string[]): Promise<Record<string, number>> {
    const key = `price:native:${[...ids].sort().join(",")}`;
    return cached(this.cache, key, TTL_MS, () => fetchNativePrices(ids, this.#key()));
  }

  async tokens(platform: string, addresses: readonly string[]): Promise<Record<string, number>> {
    const sorted = [...addresses].map((a) => a.toLowerCase()).sort();
    const key = `price:token:${platform}:${sorted.join(",")}`;
    return cached(this.cache, key, TTL_MS, () =>
      fetchTokenPrices(platform, addresses, this.#key()),
    );
  }

  #key(): string {
    return this.config.get<string>("COINGECKO_API_KEY") ?? "";
  }
}
