import type { PriceProvider } from "../ports/price-provider.js";

const BASE_URL = "https://api.coingecko.com/api/v3";

function usdOf(data: unknown, key: string): number | null {
  if (typeof data !== "object" || data === null) return null;
  const entry = (data as Record<string, unknown>)[key];
  if (typeof entry !== "object" || entry === null) return null;
  const usd = (entry as Record<string, unknown>).usd;
  return typeof usd === "number" ? usd : null;
}

// Direct CoinGecko access, used only as the offline-of-backend fallback so USD
// values survive when the API is down. Keyless by default (public tier); the
// backend remains the primary, keyed, cached source.
export class CoinGeckoPriceProvider implements PriceProvider {
  constructor(private readonly apiKey = "") {}

  async nativeUsd(coingeckoId: string): Promise<number | null> {
    const data = await this.#get(`/simple/price?ids=${coingeckoId}&vs_currencies=usd`);
    return usdOf(data, coingeckoId);
  }

  async tokensUsd(platform: string, addresses: readonly string[]): Promise<Record<string, number>> {
    if (addresses.length === 0) return {};
    const csv = addresses.map((address) => address.toLowerCase()).join(",");
    const data = await this.#get(
      `/simple/token_price/${platform}?contract_addresses=${csv}&vs_currencies=usd`,
    );
    const prices: Record<string, number> = {};
    if (typeof data === "object" && data !== null) {
      for (const address of Object.keys(data)) {
        const usd = usdOf(data, address);
        if (usd !== null) prices[address.toLowerCase()] = usd;
      }
    }
    return prices;
  }

  async #get(path: string): Promise<unknown> {
    try {
      const key = this.apiKey
        ? `${path.includes("?") ? "&" : "?"}x_cg_demo_api_key=${this.apiKey}`
        : "";
      const response = await fetch(BASE_URL + path + key);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
}
