import { getJson } from "./http.js";
import { num, str } from "./read.js";

const BASE_URL = "https://lite-api.jup.ag";

// A Solana token (by mint). No chainId — Jupiter is Solana-only, unlike
// LI.FI's per-EVM-chain TokenInfo.
export interface JupiterTokenInfo {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly logoUrl: string | null;
}

function parseTokenList(data: unknown): JupiterTokenInfo[] {
  if (!Array.isArray(data)) return [];
  const tokens: JupiterTokenInfo[] = [];
  for (const raw of data) {
    if (typeof raw !== "object" || raw === null) continue;
    const token = raw as Record<string, unknown>;
    const address = str(token, "id");
    const symbol = str(token, "symbol");
    if (!address || !symbol) continue;
    tokens.push({
      address,
      symbol,
      name: str(token, "name") || symbol,
      decimals: num(token, "decimals"),
      logoUrl: str(token, "icon") || null,
    });
  }
  return tokens;
}

// Ranked search by name/symbol/mint — Jupiter does the ranking server-side,
// unlike LI.FI's flat list (there's no separate searchTokens() to share here).
export async function searchJupiterTokens(
  query: string,
  limit: number,
): Promise<JupiterTokenInfo[]> {
  const q = query.trim();
  if (!q) return [];
  const url = new URL(`${BASE_URL}/tokens/v2/search`);
  url.searchParams.set("query", q);
  return parseTokenList(await getJson(url)).slice(0, limit);
}

// Look up one or more mints' metadata in a single call — used to fill in a
// quote's display fields (symbol/name/decimals), which Jupiter's /quote
// endpoint itself doesn't return (only mint addresses and amounts).
export async function fetchJupiterTokenMeta(
  mints: readonly string[],
): Promise<Map<string, JupiterTokenInfo>> {
  const unique = [...new Set(mints)];
  const result = new Map<string, JupiterTokenInfo>();
  if (unique.length === 0) return result;

  const url = new URL(`${BASE_URL}/tokens/v2/search`);
  url.searchParams.set("query", unique.join(","));
  for (const token of parseTokenList(await getJson(url))) {
    result.set(token.address, token);
  }
  return result;
}
