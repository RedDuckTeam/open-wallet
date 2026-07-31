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

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string | URL, init?: RequestInit) => {
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
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("JupiterClient", () => {
  it("maps a route + token metadata + built tx to a quote", async () => {
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
    expect(quote.execution).toEqual({ kind: "solana", transactionBase64: "base64-tx-bytes" });
  });

  it("sends slippage as basis points and the user's pubkey to /swap", async () => {
    let quoteUrl = "";
    let swapBody: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.includes("/swap/v1/quote")) {
          quoteUrl = u;
          return Promise.resolve({ ok: true, json: () => Promise.resolve(QUOTE_ROUTE) });
        }
        if (u.includes("/tokens/v2/search")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(TOKEN_META) });
        }
        swapBody = JSON.parse(init?.body as string);
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SWAP_BUILD) });
      }),
    );

    await new JupiterClient().quote(params);

    expect(quoteUrl).toContain("slippageBps=50");
    expect(swapBody).toMatchObject({ userPublicKey: params.fromAddress });
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
});
