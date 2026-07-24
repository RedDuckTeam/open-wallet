import type { SwapQuoteResponse } from "@openwallet/api-contract";
import { getJson, postJson, UpstreamError } from "./http.js";
import { asRecord, str } from "./read.js";
import { fetchJupiterTokenMeta } from "./tokens.js";

const BASE_URL = "https://lite-api.jup.ag";

// Wrapped SOL's mint is Jupiter/Solana's convention for "native SOL" in a
// swap context — the same role the zero address plays for an EVM native asset.
export const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

export interface SolanaSwapQuoteParams {
  readonly fromAddress: string;
  // Mint address; NATIVE_SOL_MINT for native SOL.
  readonly fromToken: string;
  readonly toToken: string;
  // Base units (lamports / the token's smallest unit).
  readonly fromAmount: string;
  // Fraction, e.g. 0.005 for 0.5%.
  readonly slippage: number;
}

/**
 * A Jupiter (https://jup.ag) client: same-chain Solana swap quotes,
 * normalized to a ready-to-sign execution — the Solana counterpart to
 * `@openwallet/lifi-client`'s `LifiClient`, same dual role (server-side with
 * a higher rate limit, or directly from the extension, keyless, as a
 * fallback when the backend is unreachable).
 *
 * Two Jupiter calls are needed where LI.FI needs one: `/quote` (the route)
 * doesn't include token symbol/decimals, only mint addresses and amounts, so
 * a token-metadata lookup fills in the display fields; then `/swap` builds
 * the actual serialized transaction from that route.
 */
export class JupiterClient {
  async quote(params: SolanaSwapQuoteParams): Promise<SwapQuoteResponse> {
    const quoteUrl = new URL(`${BASE_URL}/swap/v1/quote`);
    quoteUrl.searchParams.set("inputMint", params.fromToken);
    quoteUrl.searchParams.set("outputMint", params.toToken);
    quoteUrl.searchParams.set("amount", params.fromAmount);
    quoteUrl.searchParams.set("slippageBps", String(Math.round(params.slippage * 10_000)));

    const [route, meta] = await Promise.all([
      this.#getQuote(quoteUrl),
      fetchJupiterTokenMeta([params.fromToken, params.toToken]),
    ]);

    const build = await postJson(new URL(`${BASE_URL}/swap/v1/swap`), {
      quoteResponse: route,
      userPublicKey: params.fromAddress,
    });

    const r = asRecord(route);
    const b = asRecord(build);
    return {
      fromSymbol: meta.get(params.fromToken)?.symbol ?? "",
      toSymbol: meta.get(params.toToken)?.symbol ?? "",
      fromAmount: str(r, "inAmount"),
      toAmount: str(r, "outAmount"),
      toAmountMin: str(r, "otherAmountThreshold"),
      fromDecimals: meta.get(params.fromToken)?.decimals ?? 0,
      toDecimals: meta.get(params.toToken)?.decimals ?? 0,
      tool: "Jupiter",
      // Solana network fees are consistently negligible (fractions of a
      // cent) and Jupiter doesn't quote them in USD, unlike LI.FI's gasUsd.
      gasUsd: null,
      execution: { kind: "solana", transactionBase64: str(b, "swapTransaction") },
    };
  }

  async #getQuote(url: URL): Promise<unknown> {
    try {
      return await getJson(url);
    } catch (error) {
      if (error instanceof UpstreamError) {
        const message = str(asRecord(error.body), "error");
        throw new Error(message || `No swap route available (${String(error.status)})`, {
          cause: error,
        });
      }
      throw error;
    }
  }
}
