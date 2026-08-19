import { afterEach, describe, expect, it, vi } from "vitest";
import { JupiterClient, NATIVE_SOL_MINT } from "../src/client.js";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const QUOTE_ROUTE = {
  inputMint: NATIVE_SOL_MINT,
  inAmount: "1000000000",
  outputMint: USDC_MINT,
  outAmount: "150000000",
  otherAmountThreshold: "149000000",
  slippageBps: 50,
  priceImpactPct: "0.0421",
};

const SWAP_BUILD = {
  swapTransaction: "base64-tx-bytes",
  lastValidBlockHeight: 123,
};

const TOKEN_META = [
  { id: NATIVE_SOL_MINT, symbol: "SOL", name: "Wrapped SOL", decimals: 9, icon: "sol.png" },
  { id: USDC_MINT, symbol: "USDC", name: "USD Coin", decimals: 6, icon: "usdc.png" },
];

const params = {
  fromAddress: "11111111111111111111111111111111",
  fromToken: NATIVE_SOL_MINT,
  toToken: USDC_MINT,
  fromAmount: "1000000000",
  slippage: 0.005,
};

function stubFetch(): ReturnType<typeof vi.fn> {
  const mock = vi.fn((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/swap/v1/quote")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(QUOTE_ROUTE) });
    }
    if (u.includes("/tokens/v2/search")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(TOKEN_META) });
    }
    if (u.includes("/swap/v1/swap") && init?.method === "POST") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SWAP_BUILD) });
    }
    throw new Error(`unexpected fetch: ${u}`);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("JupiterClient.quote", () => {
  it("maps a route + token metadata to a quote holding the raw route", async () => {
    stubFetch();

    const quote = await new JupiterClient().quote(params);

    expect(quote.fromSymbol).toBe("SOL");
    expect(quote.toSymbol).toBe("USDC");
    expect(quote.fromAmount).toBe("1000000000");
    expect(quote.toAmount).toBe("150000000");
    expect(quote.toAmountMin).toBe("149000000");
    expect(quote.fromDecimals).toBe(9);
    expect(quote.toDecimals).toBe(6);
    expect(quote.tool).toBe("Jupiter");
    expect(quote.gasUsd).toBeNull();
    expect(quote.priceImpactPct).toBeCloseTo(0.0421);
    // The execution is the route itself, not a built transaction: building
    // is deferred to confirmation time so the blockhash can't expire while
    // the user reads the quote.
    expect(quote.execution).toEqual({ kind: "solana", route: QUOTE_ROUTE });
  });

  it("does not call /swap at quote time", async () => {
    const mock = stubFetch();
    await new JupiterClient().quote(params);
    const posted = mock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === "POST");
    expect(posted).toHaveLength(0);
  });

  it("sends slippage as basis points", async () => {
    const mock = stubFetch();
    await new JupiterClient().quote(params);
    const quoteCall = mock.mock.calls.map(([url]) => String(url)).find((u) => u.includes("/quote"));
    expect(quoteCall).toContain("slippageBps=50");
  });

  it("reports a missing price impact as null rather than 0", async () => {
    const routeWithout: Record<string, unknown> = { ...QUOTE_ROUTE };
    delete routeWithout.priceImpactPct;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL) => {
        const u = String(url);
        if (u.includes("/quote")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(routeWithout) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(TOKEN_META) });
      }),
    );
    const quote = await new JupiterClient().quote(params);
    expect(quote.priceImpactPct).toBeNull();
  });

  it("throws the API's error message on a failed quote", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () =>
            Promise.resolve({
              error: "Input and output mints are not allowed to be equal",
              errorCode: "CIRCULAR_ARBITRAGE_IS_DISABLED",
            }),
        }),
      ),
    );

    await expect(new JupiterClient().quote(params)).rejects.toThrow(
      "Input and output mints are not allowed to be equal",
    );
  });

  it("blames rate limiting, not the route, on a 429 with no body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 429, json: () => Promise.reject(new Error("empty")) }),
      ),
    );
    await expect(new JupiterClient().quote(params)).rejects.toThrow(/rate limiting/i);
  });
});

describe("JupiterClient.buildSwapTransaction", () => {
  it("posts the route and the user's pubkey with a dynamic compute limit", async () => {
    const mock = stubFetch();

    const tx = await new JupiterClient().buildSwapTransaction(QUOTE_ROUTE, params.fromAddress);

    expect(tx).toBe("base64-tx-bytes");
    const call = mock.mock.calls.find(([url]) => String(url).includes("/swap/v1/swap"));
    const init = call?.[1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      quoteResponse: QUOTE_ROUTE,
      userPublicKey: params.fromAddress,
      dynamicComputeUnitLimit: true,
    });
  });

  it("refuses an empty build response instead of signing nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
    );
    await expect(
      new JupiterClient().buildSwapTransaction(QUOTE_ROUTE, params.fromAddress),
    ).rejects.toThrow(/no transaction/i);
  });
});
