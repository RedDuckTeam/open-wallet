import type { SwapQuoteResponse } from "@openwallet/api-contract";
import { getJson, postJson, UpstreamError } from "./http.js";
import { asRecord, str } from "./read.js";
import { fetchJupiterTokenMeta } from "./tokens.js";

/**
 * Jupiter serves two hosts: `lite-api` is the keyless public tier, `api` is
 * the keyed one with a higher rate limit. Which host is used follows from
 * whether a key is held — a key sent to `lite-api` is ignored, and `api`
 * without one is rejected — so the two travel together.
 */
const LITE_URL = "https://lite-api.jup.ag";
const KEYED_URL = "https://api.jup.ag";

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

/** Jupiter reports price impact as a stringified fraction-of-one percentage, e.g. "0.123" for 0.123%. */
function parsePriceImpact(route: Record<string, unknown>): number | null {
  const raw = route.priceImpactPct;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : null;
}

/**
 * A Jupiter (https://jup.ag) client: same-chain Solana swap quotes — the
 * Solana counterpart to `@openwallet/lifi-client`'s `LifiClient`.
 *
 * Quoting and building are deliberately two calls. `quote()` fetches the
 * route and display fields; `buildSwapTransaction()` turns that route into a
 * signable transaction. A Solana transaction embeds a recent blockhash and
 * expires with it about a minute later, so building at quote time would hand
 * the user a transaction that dies while they read the numbers. The wallet
 * calls build at confirmation, then signs and broadcasts immediately.
 */
export class JupiterClient {
  /** An empty key means the keyless public tier, which is rate limited but works. */
  constructor(private readonly apiKey = "") {}

  get #baseUrl(): string {
    return this.apiKey ? KEYED_URL : LITE_URL;
  }

  get #headers(): Record<string, string> | undefined {
    return this.apiKey ? { "x-api-key": this.apiKey } : undefined;
  }

  /**
   * The route and its display fields. Two upstream calls where LI.FI needs
   * one: `/quote` returns only mint addresses and amounts, so a token-metadata
   * lookup fills in symbols and decimals.
   */
  async quote(params: SolanaSwapQuoteParams): Promise<SwapQuoteResponse> {
    const quoteUrl = new URL(`${this.#baseUrl}/swap/v1/quote`);
    quoteUrl.searchParams.set("inputMint", params.fromToken);
    quoteUrl.searchParams.set("outputMint", params.toToken);
    quoteUrl.searchParams.set("amount", params.fromAmount);
    quoteUrl.searchParams.set("slippageBps", String(Math.round(params.slippage * 10_000)));

    const [route, meta] = await Promise.all([
      this.#call(() => getJson(quoteUrl, this.#headers)),
      fetchJupiterTokenMeta([params.fromToken, params.toToken], this.apiKey),
    ]);

    const r = asRecord(route);
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
      priceImpactPct: parsePriceImpact(r),
      // The parsed record, not the raw unknown: the contract types the route
      // as an object, and a non-object response has already been reduced to
      // an empty record by the defensive reader above.
      execution: { kind: "solana", route: r },
    };
  }

  /**
   * Builds the signable transaction for a previously quoted route. Must be
   * called right before signing — the returned transaction carries a fresh
   * blockhash and is only valid for about a minute.
   *
   * `dynamicComputeUnitLimit` replaces the default 1.4M compute ceiling with
   * a simulated estimate, which prices the transaction honestly instead of
   * as a worst case. The priority fee is left at Jupiter's `"auto"` default,
   * which they cap at 0.005 SOL.
   */
  async buildSwapTransaction(route: unknown, userPublicKey: string): Promise<string> {
    const build = await this.#call(() =>
      postJson(
        new URL(`${this.#baseUrl}/swap/v1/swap`),
        { quoteResponse: route, userPublicKey, dynamicComputeUnitLimit: true },
        this.#headers,
      ),
    );
    const transactionBase64 = str(asRecord(build), "swapTransaction");
    if (!transactionBase64) {
      throw new Error("Jupiter returned no transaction for this route");
    }
    return transactionBase64;
  }

  /**
   * Runs one upstream call, translating an `UpstreamError` into a message a
   * user can act on. Jupiter's own `error` field is the best text when
   * present; otherwise the status decides, because "No swap route available
   * (429)" would blame the route for what is actually rate limiting.
   */
  async #call(request: () => Promise<unknown>): Promise<unknown> {
    try {
      return await request();
    } catch (error) {
      if (error instanceof UpstreamError) {
        const message = str(asRecord(error.body), "error");
        throw new Error(message || fallbackMessage(error.status), { cause: error });
      }
      throw error;
    }
  }
}

function fallbackMessage(status: number): string {
  if (status === 429) return "Jupiter is rate limiting requests. Wait a moment and try again.";
  if (status >= 500) return `Jupiter is temporarily unavailable (${String(status)})`;
  return `No swap route available (${String(status)})`;
}
