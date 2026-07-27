import { getJson } from "../common/http.js";

const BASE_URL = "https://api.coingecko.com/api/v3";

function usdOf(data: unknown, key: string): number | null {
  if (typeof data !== "object" || data === null) return null;
  const entry = (data as Record<string, unknown>)[key];
  if (typeof entry !== "object" || entry === null) return null;
  const usd = (entry as Record<string, unknown>).usd;
  return typeof usd === "number" ? usd : null;
}

function withKey(path: string, apiKey: string): string {
  if (!apiKey) return BASE_URL + path;
  return `${BASE_URL}${path}${path.includes("?") ? "&" : "?"}x_cg_demo_api_key=${apiKey}`;
}

// USD prices for native coins by CoinGecko id.
export async function fetchNativePrices(
  ids: readonly string[],
  apiKey: string,
): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const csv = ids.join(",");
  const data = await getJson(withKey(`/simple/price?ids=${csv}&vs_currencies=usd`, apiKey));
  const prices: Record<string, number> = {};
  for (const id of ids) {
    const usd = usdOf(data, id);
    if (usd !== null) prices[id] = usd;
  }
  return prices;
}

// USD prices for tokens by contract address on a platform (e.g. "ethereum").
// Keys come back lowercased.
export async function fetchTokenPrices(
  platform: string,
  addresses: readonly string[],
  apiKey: string,
): Promise<Record<string, number>> {
  if (addresses.length === 0) return {};
  const csv = addresses.map((address) => address.toLowerCase()).join(",");
  const data = await getJson(
    withKey(`/simple/token_price/${platform}?contract_addresses=${csv}&vs_currencies=usd`, apiKey),
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
