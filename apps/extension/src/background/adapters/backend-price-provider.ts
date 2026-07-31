import type { PriceProvider } from "../ports/price-provider.js";
import type { BackendClient } from "./backend.js";

// PriceProvider backed by the OpenWallet API (which proxies + caches CoinGecko).
// Best-effort: a failed request yields null/empty, never throwing, so a flaky
// backend can't break balances. The CachedPriceProvider adds stale-on-error.
export class BackendPriceProvider implements PriceProvider {
  constructor(private readonly backend: BackendClient) {}

  async nativeUsd(coingeckoId: string): Promise<number | null> {
    try {
      const prices = await this.backend.nativePrices([coingeckoId]);
      return prices[coingeckoId] ?? null;
    } catch {
      return null;
    }
  }

  async tokensUsd(platform: string, addresses: readonly string[]): Promise<Record<string, number>> {
    try {
      return await this.backend.tokenPrices(platform, addresses);
    } catch {
      return {};
    }
  }
}
