import type { TokenInfo } from "@openwallet/api-contract";
import { getJson } from "./http.js";
import { num, record, str } from "./read.js";

const BASE_URL = "https://li.quest/v1";

// LI.FI's token registry per chain: address, symbol, name, decimals, logoURI.
// One keyless-ish source covering every EVM chain we support.
export async function fetchLifiTokens(chainId: number, apiKey = ""): Promise<TokenInfo[]> {
  const url = new URL(`${BASE_URL}/tokens`);
  url.searchParams.set("chains", String(chainId));
  const data = await getJson(url, apiKey ? { "x-lifi-api-key": apiKey } : undefined);

  const list = record(data, "tokens")[String(chainId)];
  if (!Array.isArray(list)) return [];

  const tokens: TokenInfo[] = [];
  for (const raw of list) {
    if (typeof raw !== "object" || raw === null) continue;
    const token = raw as Record<string, unknown>;
    const address = str(token, "address");
    const symbol = str(token, "symbol");
    if (!address || !symbol) continue;
    tokens.push({
      chainId,
      address: address.toLowerCase(),
      symbol,
      name: str(token, "name") || symbol,
      decimals: num(token, "decimals"),
      logoUrl: str(token, "logoURI") || null,
    });
  }
  return tokens;
}

// Ranked, capped search over an already-fetched token list. Empty query
// returns the head of the list (LI.FI orders it roughly by liquidity). Shared
// so a caller with only the raw list (e.g. a client-side fallback with no
// server-side cache) still gets the same ranking quality as the backend.
export function searchTokens(
  tokens: readonly TokenInfo[],
  query: string,
  limit: number,
): TokenInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return tokens.slice(0, limit);

  const scored = tokens
    .map((token) => ({ token, score: matchScore(token, q) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((entry) => entry.token);
}

// Exact symbol/address beats prefix beats substring, so "usdc" surfaces USDC.
function matchScore(token: TokenInfo, q: string): number {
  const symbol = token.symbol.toLowerCase();
  const name = token.name.toLowerCase();
  if (symbol === q || token.address === q) return 100;
  if (symbol.startsWith(q)) return 80;
  if (name.startsWith(q)) return 60;
  if (symbol.includes(q) || name.includes(q)) return 40;
  if (token.address.includes(q)) return 20;
  return 0;
}
