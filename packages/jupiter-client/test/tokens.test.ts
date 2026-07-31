import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJupiterTokenMeta, searchJupiterTokens } from "../src/tokens.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchJupiterTokens", () => {
  it("maps Jupiter's search results to JupiterTokenInfo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                symbol: "USDC",
                name: "USD Coin",
                decimals: 6,
                icon: "u.png",
              },
              { id: "0xno-symbol" },
            ]),
        }),
      ),
    );

    const tokens = await searchJupiterTokens("usdc", 10);
    expect(tokens).toEqual([
      {
        address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        logoUrl: "u.png",
      },
    ]);
  });

  it("returns an empty list for a blank query without calling out", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchJupiterTokens("  ", 10)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps results at the limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              Array.from({ length: 5 }, (_, i) => ({
                id: `mint${String(i)}`,
                symbol: `T${String(i)}`,
                name: `Token ${String(i)}`,
                decimals: 6,
              })),
            ),
        }),
      ),
    );
    expect(await searchJupiterTokens("t", 2)).toHaveLength(2);
  });
});

describe("fetchJupiterTokenMeta", () => {
  it("returns a map keyed by mint address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: "mintA", symbol: "AAA", name: "Token A", decimals: 6 },
              { id: "mintB", symbol: "BBB", name: "Token B", decimals: 9 },
            ]),
        }),
      ),
    );

    const meta = await fetchJupiterTokenMeta(["mintA", "mintB"]);
    expect(meta.get("mintA")?.symbol).toBe("AAA");
    expect(meta.get("mintB")?.decimals).toBe(9);
  });

  it("returns an empty map without calling out for an empty mint list", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchJupiterTokenMeta([])).toEqual(new Map());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deduplicates repeated mints into one request", async () => {
    const fetchMock = vi.fn<
      (url: string | URL) => Promise<{ ok: true; json: () => Promise<unknown> }>
    >(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ id: "mintA", symbol: "AAA", name: "Token A", decimals: 6 }]),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchJupiterTokenMeta(["mintA", "mintA"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("query=mintA");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain(",");
  });
});
