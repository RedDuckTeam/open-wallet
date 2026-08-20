import { afterEach, describe, expect, it, vi } from "vitest";
import { LifiClient } from "../src/client.js";

const ROUTE = {
  action: {
    fromToken: { address: "0xToken", symbol: "USDC", decimals: 6 },
    toToken: { address: "0x0000000000000000000000000000000000000000", symbol: "ETH", decimals: 18 },
  },
  estimate: {
    fromAmount: "1000000",
    toAmount: "500000000000000",
    toAmountMin: "495000000000000",
    approvalAddress: "0xRouter",
    gasCosts: [{ amountUSD: "0.12" }],
    fromAmountUSD: "100.00",
    toAmountUSD: "99.20",
  },
  toolDetails: { name: "1inch" },
  transactionRequest: { to: "0xRouter", data: "0xdeadbeef", value: "0x0", gasLimit: "0x5208" },
};

const params = {
  chainId: 1,
  fromAddress: "0xUser",
  fromToken: "0xToken",
  toToken: "0x0000000000000000000000000000000000000000",
  fromAmount: "1000000",
  slippage: 0.005,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LifiClient", () => {
  it("maps a route to a quote with a signable execution", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(ROUTE) })),
    );

    const quote = await new LifiClient("").quote(params);
    expect(quote.fromSymbol).toBe("USDC");
    expect(quote.toSymbol).toBe("ETH");
    expect(quote.toAmount).toBe("500000000000000");
    expect(quote.gasUsd).toBe(0.12);
    // (100 - 99.2) / 100 = 0.8%
    expect(quote.priceImpactPct).toBeCloseTo(0.8);
    expect(quote.tool).toBe("1inch");
    if (quote.execution.kind !== "evm") throw new Error("expected an EVM execution");
    expect(quote.execution.swapTx).toEqual({
      to: "0xRouter",
      data: "0xdeadbeef",
      value: "0",
      gasLimit: "21000",
    });
    expect(quote.execution.approval).toEqual({
      token: "0xToken",
      spender: "0xRouter",
      amount: "1000000",
    });
  });

  it("throws the API message on a failed quote", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ message: "No route" }),
        }),
      ),
    );
    await expect(new LifiClient("").quote(params)).rejects.toThrow("No route");
  });

  it("omits the approval for a native input", () => {
    const nativeRoute = {
      ...ROUTE,
      action: {
        ...ROUTE.action,
        fromToken: {
          address: "0x0000000000000000000000000000000000000000",
          symbol: "ETH",
          decimals: 18,
        },
      },
    };
    const execution = new LifiClient("").parseExecution(nativeRoute);
    expect(execution.approval).toBeNull();
    expect(execution.swapTx.value).toBe("0");
  });

  it("works keyless (no api key), for the extension's direct fallback", async () => {
    let requestUrl: string | URL | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL) => {
        requestUrl = url;
        return Promise.resolve({ ok: true, json: () => Promise.resolve(ROUTE) });
      }),
    );

    await new LifiClient().quote(params);
    expect(String(requestUrl)).toContain("li.quest/v1/quote");
  });
});

describe("LifiClient error mapping", () => {
  it("blames rate limiting, not the route, on a 429 with no message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 429, json: () => Promise.reject(new Error("empty")) }),
      ),
    );
    await expect(new LifiClient("").quote(params)).rejects.toThrow(/rate limiting/i);
  });

  it("reports a missing USD valuation as null impact rather than 0", async () => {
    const bareEstimate: Record<string, unknown> = { ...ROUTE.estimate };
    delete bareEstimate.fromAmountUSD;
    delete bareEstimate.toAmountUSD;
    const route = { ...ROUTE, estimate: bareEstimate };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(route) })),
    );
    const quote = await new LifiClient("").quote(params);
    expect(quote.priceImpactPct).toBeNull();
  });
});
