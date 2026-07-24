import { afterEach, describe, expect, it, vi } from "vitest";
import type { TokenInfo } from "@openwallet/api-contract";
import { fetchLifiTokens, searchTokens } from "../src/tokens.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLifiTokens", () => {
  it("maps LI.FI's per-chain token list to TokenInfo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              tokens: {
                "1": [
                  { address: "0xABC", symbol: "USDC", name: "USD Coin", decimals: 6, logoURI: "u" },
                  { address: "0xdef", symbol: "" }, // missing symbol -> dropped
                ],
              },
            }),
        }),
      ),
    );

    const tokens = await fetchLifiTokens(1);
    expect(tokens).toEqual([
      { chainId: 1, address: "0xabc", symbol: "USDC", name: "USD Coin", decimals: 6, logoUrl: "u" },
    ]);
  });

  it("returns an empty list when the chain has no entry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ tokens: {} }) })),
    );
    expect(await fetchLifiTokens(999)).toEqual([]);
  });
});

const TOKENS: TokenInfo[] = [
  { chainId: 1, address: "0xusdc", symbol: "USDC", name: "USD Coin", decimals: 6, logoUrl: null },
  { chainId: 1, address: "0xusdt", symbol: "USDT", name: "Tether USD", decimals: 6, logoUrl: null },
  {
    chainId: 1,
    address: "0xdai",
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    logoUrl: null,
  },
];

describe("searchTokens", () => {
  it("returns the head of the list for an empty query", () => {
    expect(searchTokens(TOKENS, "", 2)).toEqual(TOKENS.slice(0, 2));
  });

  it("ranks an exact symbol match first", () => {
    const result = searchTokens(TOKENS, "usdc", 10);
    expect(result[0]?.symbol).toBe("USDC");
  });

  it("matches by name substring", () => {
    const result = searchTokens(TOKENS, "stablecoin", 10);
    expect(result).toEqual([TOKENS[2]]);
  });

  it("caps results at the limit", () => {
    expect(searchTokens(TOKENS, "usd", 1)).toHaveLength(1);
  });

  it("excludes non-matches", () => {
    expect(searchTokens(TOKENS, "nonexistent", 10)).toEqual([]);
  });
});
