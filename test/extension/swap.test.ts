import { afterEach, describe, expect, it, vi } from "vitest";
import { ChainKind, type SwapQuoteView } from "../../apps/extension/src/messaging/protocol.js";
import { createSwapService } from "../../apps/extension/src/background/swap.js";
import type { BackendClient } from "../../apps/extension/src/background/adapters/backend.js";
import type {
  BitcoinNetwork,
  EvmNetwork,
  SolanaNetwork,
} from "../../apps/extension/src/config/networks.js";

const CHAIN_ID = 1;
const EVM_NETWORK: EvmNetwork = {
  kind: ChainKind.Evm,
  id: "ethereum",
  name: "Ethereum",
  nativeSymbol: "ETH",
  nativeDecimals: 18,
  color: "#000",
  chain: { id: CHAIN_ID } as EvmNetwork["chain"],
  rpcUrl: "https://example.invalid",
};

const SOLANA_NETWORK: SolanaNetwork = {
  kind: ChainKind.Solana,
  id: "solana",
  name: "Solana",
  nativeSymbol: "SOL",
  nativeDecimals: 9,
  color: "#000",
  rpcUrl: "https://example.invalid",
  explorerCluster: "",
};

const BITCOIN_NETWORK: BitcoinNetwork = {
  kind: ChainKind.Bitcoin,
  id: "bitcoin",
  name: "Bitcoin",
  nativeSymbol: "BTC",
  nativeDecimals: 8,
  color: "#000",
  esploraUrl: "https://example.invalid",
  explorerBase: "https://example.invalid",
  params: {} as BitcoinNetwork["params"],
};

const QUOTE: SwapQuoteView = {
  fromSymbol: "ETH",
  toSymbol: "USDC",
  fromAmount: "1000000000000000000",
  toAmount: "2000000000",
  toAmountMin: "1990000000",
  fromDecimals: 18,
  toDecimals: 6,
  tool: "1inch",
  gasUsd: 1.2,
  execution: {
    kind: "evm",
    swapTx: { to: "0xRouter", data: "0x", value: "0", gasLimit: null },
    approval: null,
  },
};

function backendWith(
  overrides: Partial<
    Pick<BackendClient, "swapQuote" | "searchTokens" | "solanaSwapQuote" | "searchSolanaTokens">
  >,
): BackendClient {
  return { ...overrides } as unknown as BackendClient;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createSwapService#getQuote (EVM)", () => {
  it("uses the backend's quote when it succeeds", async () => {
    const swapQuote = vi.fn().mockResolvedValue(QUOTE);
    const swap = createSwapService(backendWith({ swapQuote }));

    const result = await swap.getQuote(
      EVM_NETWORK,
      "0xFrom",
      "0xFromToken",
      "0xToToken",
      "1000000000000000000",
    );

    expect(result).toBe(QUOTE);
    expect(swapQuote).toHaveBeenCalledWith({
      chainId: CHAIN_ID,
      fromAddress: "0xFrom",
      fromToken: "0xFromToken",
      toToken: "0xToToken",
      fromAmount: "1000000000000000000",
      slippage: 0.005,
    });
  });

  it("resolves a null (native) token to the zero address", async () => {
    const swapQuote = vi.fn().mockResolvedValue(QUOTE);
    const swap = createSwapService(backendWith({ swapQuote }));

    await swap.getQuote(EVM_NETWORK, "0xFrom", null, "0xToToken", "1000000000000000000");

    expect(swapQuote).toHaveBeenCalledWith(
      expect.objectContaining({ fromToken: "0x0000000000000000000000000000000000000000" }),
    );
  });

  it("falls back to calling LI.FI directly when the backend is unreachable", async () => {
    const swapQuote = vi.fn().mockRejectedValue(new Error("backend down"));
    const swap = createSwapService(backendWith({ swapQuote }));

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              action: {
                fromToken: { address: "0xFromToken", symbol: "ETH", decimals: 18 },
                toToken: { address: "0xToToken", symbol: "USDC", decimals: 6 },
              },
              estimate: {
                fromAmount: "1000000000000000000",
                toAmount: "2000000000",
                toAmountMin: "1990000000",
                approvalAddress: "0xRouter",
              },
              toolDetails: { name: "1inch" },
              transactionRequest: { to: "0xRouter", data: "0xdead", value: "0x0" },
            }),
        }),
      ),
    );

    const result = await swap.getQuote(
      EVM_NETWORK,
      "0xFrom",
      "0xFromToken",
      "0xToToken",
      "1000000000000000000",
    );

    expect(swapQuote).toHaveBeenCalled();
    expect(result.toSymbol).toBe("USDC");
    if (result.execution.kind !== "evm") throw new Error("expected an EVM execution");
    expect(result.execution.swapTx.to).toBe("0xRouter");
  });
});

describe("createSwapService#tokens (EVM)", () => {
  it("uses the backend's search results when it succeeds", async () => {
    const searchTokens = vi.fn().mockResolvedValue([
      {
        chainId: CHAIN_ID,
        address: "0xusdc",
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        logoUrl: null,
      },
    ]);
    const swap = createSwapService(backendWith({ searchTokens }));

    const result = await swap.tokens(EVM_NETWORK, "usdc");

    expect(searchTokens).toHaveBeenCalledWith(CHAIN_ID, "usdc", 50);
    expect(result).toEqual([
      { address: "0xusdc", symbol: "USDC", name: "USD Coin", decimals: 6, iconUrl: null },
    ]);
  });

  it("falls back to fetching LI.FI's token list directly when the backend is unreachable", async () => {
    const searchTokens = vi.fn().mockRejectedValue(new Error("backend down"));
    const swap = createSwapService(backendWith({ searchTokens }));

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              tokens: {
                [String(CHAIN_ID)]: [
                  {
                    address: "0xUSDC",
                    symbol: "USDC",
                    name: "USD Coin",
                    decimals: 6,
                    logoURI: null,
                  },
                ],
              },
            }),
        }),
      ),
    );

    const result = await swap.tokens(EVM_NETWORK, "usdc");

    expect(searchTokens).toHaveBeenCalled();
    expect(result).toEqual([
      { address: "0xusdc", symbol: "USDC", name: "USD Coin", decimals: 6, iconUrl: null },
    ]);
  });
});

const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const SOLANA_QUOTE: SwapQuoteView = {
  fromSymbol: "SOL",
  toSymbol: "USDC",
  fromAmount: "1000000000",
  toAmount: "150000000",
  toAmountMin: "149000000",
  fromDecimals: 9,
  toDecimals: 6,
  tool: "Jupiter",
  gasUsd: null,
  execution: { kind: "solana", transactionBase64: "base64-tx" },
};

describe("createSwapService#getQuote (Solana)", () => {
  it("uses the backend's quote when it succeeds", async () => {
    const solanaSwapQuote = vi.fn().mockResolvedValue(SOLANA_QUOTE);
    const swap = createSwapService(backendWith({ solanaSwapQuote }));

    const result = await swap.getQuote(
      SOLANA_NETWORK,
      "SolanaPubkey",
      NATIVE_SOL_MINT,
      USDC_MINT,
      "1000000000",
    );

    expect(result).toBe(SOLANA_QUOTE);
    expect(solanaSwapQuote).toHaveBeenCalledWith({
      fromAddress: "SolanaPubkey",
      fromToken: NATIVE_SOL_MINT,
      toToken: USDC_MINT,
      fromAmount: "1000000000",
      slippage: 0.005,
    });
  });

  it("resolves a null (native) token to the wrapped-SOL mint", async () => {
    const solanaSwapQuote = vi.fn().mockResolvedValue(SOLANA_QUOTE);
    const swap = createSwapService(backendWith({ solanaSwapQuote }));

    await swap.getQuote(SOLANA_NETWORK, "SolanaPubkey", null, USDC_MINT, "1000000000");

    expect(solanaSwapQuote).toHaveBeenCalledWith(
      expect.objectContaining({ fromToken: NATIVE_SOL_MINT }),
    );
  });

  it("falls back to calling Jupiter directly when the backend is unreachable", async () => {
    const solanaSwapQuote = vi.fn().mockRejectedValue(new Error("backend down"));
    const swap = createSwapService(backendWith({ solanaSwapQuote }));

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.includes("/swap/v1/quote")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                inAmount: "1000000000",
                outAmount: "150000000",
                otherAmountThreshold: "149000000",
              }),
          });
        }
        if (u.includes("/tokens/v2/search")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                { id: NATIVE_SOL_MINT, symbol: "SOL", name: "Wrapped SOL", decimals: 9 },
                { id: USDC_MINT, symbol: "USDC", name: "USD Coin", decimals: 6 },
              ]),
          });
        }
        if (init?.method === "POST") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ swapTransaction: "direct-base64-tx" }),
          });
        }
        throw new Error(`unexpected fetch: ${u}`);
      }),
    );

    const result = await swap.getQuote(
      SOLANA_NETWORK,
      "SolanaPubkey",
      NATIVE_SOL_MINT,
      USDC_MINT,
      "1000000000",
    );

    expect(solanaSwapQuote).toHaveBeenCalled();
    expect(result.toSymbol).toBe("USDC");
    if (result.execution.kind !== "solana") throw new Error("expected a Solana execution");
    expect(result.execution.transactionBase64).toBe("direct-base64-tx");
  });
});

describe("createSwapService#tokens (Solana)", () => {
  it("uses the backend's search results when it succeeds", async () => {
    const searchSolanaTokens = vi
      .fn()
      .mockResolvedValue([
        { address: USDC_MINT, symbol: "USDC", name: "USD Coin", decimals: 6, logoUrl: null },
      ]);
    const swap = createSwapService(backendWith({ searchSolanaTokens }));

    const result = await swap.tokens(SOLANA_NETWORK, "usdc");

    expect(searchSolanaTokens).toHaveBeenCalledWith("usdc", 50);
    expect(result).toEqual([
      { address: USDC_MINT, symbol: "USDC", name: "USD Coin", decimals: 6, iconUrl: null },
    ]);
  });

  it("falls back to Jupiter's token search directly when the backend is unreachable", async () => {
    const searchSolanaTokens = vi.fn().mockRejectedValue(new Error("backend down"));
    const swap = createSwapService(backendWith({ searchSolanaTokens }));

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: USDC_MINT, symbol: "USDC", name: "USD Coin", decimals: 6, icon: "u.png" },
            ]),
        }),
      ),
    );

    const result = await swap.tokens(SOLANA_NETWORK, "usdc");

    expect(searchSolanaTokens).toHaveBeenCalled();
    expect(result).toEqual([
      { address: USDC_MINT, symbol: "USDC", name: "USD Coin", decimals: 6, iconUrl: "u.png" },
    ]);
  });
});

describe("createSwapService on Bitcoin (no aggregator)", () => {
  it("tokens() returns an empty list rather than erroring", async () => {
    const swap = createSwapService(backendWith({}));
    expect(await swap.tokens(BITCOIN_NETWORK, "usd")).toEqual([]);
  });

  it("getQuote() throws a clear 'not supported' error, not a Solana-flavored one", async () => {
    const swap = createSwapService(backendWith({}));
    await expect(
      swap.getQuote(BITCOIN_NETWORK, "bc1qFrom", null, "bc1qTo", "100000"),
    ).rejects.toThrow("Swaps aren't supported on Bitcoin");
  });
});
