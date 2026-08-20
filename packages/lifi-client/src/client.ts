import type { EvmSwapExecutionData, SwapQuoteResponse } from "@openwallet/api-contract";
import { getJson, UpstreamError } from "./http.js";
import { big, num, record, str } from "./read.js";

const BASE_URL = "https://li.quest/v1";

const NATIVE_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
]);

export interface SwapQuoteParams {
  readonly chainId: number;
  readonly fromAddress: string;
  // Token contract address; the zero address for native.
  readonly fromToken: string;
  readonly toToken: string;
  // Base units.
  readonly fromAmount: string;
  // Fraction, e.g. 0.005 for 0.5%.
  readonly slippage: number;
}

/**
 * LI.FI doesn't report price impact directly, but the estimate carries USD
 * valuations of both sides. Their ratio is the impact the user actually
 * experiences — fees and thin liquidity included — which is the number a
 * warning should be based on. Null when either valuation is missing or
 * nonsensical, rather than a fabricated 0.
 */
function priceImpactPct(estimate: Record<string, unknown>): number | null {
  const fromUsd = Number(str(estimate, "fromAmountUSD"));
  const toUsd = Number(str(estimate, "toAmountUSD"));
  if (!Number.isFinite(fromUsd) || !Number.isFinite(toUsd) || fromUsd <= 0) return null;
  return ((fromUsd - toUsd) / fromUsd) * 100;
}

function gasUsd(estimate: Record<string, unknown>): number | null {
  const costs = estimate.gasCosts;
  if (!Array.isArray(costs)) return null;
  const total = costs.reduce((sum: number, cost: unknown) => {
    const amount =
      typeof cost === "object" && cost !== null
        ? Number(str(cost as Record<string, unknown>, "amountUSD"))
        : 0;
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  return total > 0 ? total : null;
}

/**
 * A LI.FI (https://li.fi) client: same-chain swap quotes, normalized to a
 * ready-to-sign execution. LI.FI aggregates same-chain swaps; v1 uses
 * `fromChain === toChain`.
 *
 * One implementation, two callers: `apps/api` uses it server-side with an
 * API key for a higher rate limit and to keep the key out of the extension;
 * the extension also uses it directly, keyless, as a fallback when the
 * backend itself is unreachable — LI.FI's public tier (200 req/2h) works
 * without a key, so a single self-hosted backend instance going down doesn't
 * have to take swaps out entirely. Either caller gets the exact same parsing,
 * so the two paths can't drift into disagreeing about a route's shape.
 */
export class LifiClient {
  constructor(private readonly apiKey = "") {}

  async quote(params: SwapQuoteParams): Promise<SwapQuoteResponse> {
    const url = new URL(`${BASE_URL}/quote`);
    url.searchParams.set("fromChain", String(params.chainId));
    url.searchParams.set("toChain", String(params.chainId));
    url.searchParams.set("fromToken", params.fromToken);
    url.searchParams.set("toToken", params.toToken);
    url.searchParams.set("fromAddress", params.fromAddress);
    url.searchParams.set("fromAmount", params.fromAmount);
    url.searchParams.set("slippage", String(params.slippage));

    const route = await this.#get(url);
    return this.toResponse(route);
  }

  parseExecution(route: unknown): EvmSwapExecutionData {
    const tx = record(route, "transactionRequest");
    const estimate = record(route, "estimate");
    const fromToken = record(record(route, "action"), "fromToken");
    const token = str(fromToken, "address");
    const spender = str(estimate, "approvalAddress");

    return {
      kind: "evm",
      swapTx: {
        to: str(tx, "to"),
        data: str(tx, "data"),
        value: big(tx, "value").toString(),
        gasLimit: tx.gasLimit ? big(tx, "gasLimit").toString() : null,
      },
      approval:
        spender && !NATIVE_ADDRESSES.has(token.toLowerCase())
          ? { token, spender, amount: big(estimate, "fromAmount").toString() }
          : null,
    };
  }

  toResponse(route: unknown): SwapQuoteResponse {
    const estimate = record(route, "estimate");
    const action = record(route, "action");
    const fromToken = record(action, "fromToken");
    const toToken = record(action, "toToken");
    return {
      fromSymbol: str(fromToken, "symbol"),
      toSymbol: str(toToken, "symbol"),
      fromAmount: str(estimate, "fromAmount"),
      toAmount: str(estimate, "toAmount"),
      toAmountMin: str(estimate, "toAmountMin"),
      fromDecimals: num(fromToken, "decimals"),
      toDecimals: num(toToken, "decimals"),
      tool: str(record(route, "toolDetails"), "name") || "DEX",
      gasUsd: gasUsd(estimate),
      priceImpactPct: priceImpactPct(estimate),
      execution: this.parseExecution(route),
    };
  }

  /**
   * LI.FI's own `message` is the best text when present ("No available
   * quotes for the requested transfer"); otherwise the status decides,
   * because "No swap route available (429)" would blame the route for what
   * is actually rate limiting.
   */
  async #get(url: URL): Promise<unknown> {
    try {
      return await getJson(url, this.apiKey ? { "x-lifi-api-key": this.apiKey } : undefined);
    } catch (error) {
      if (error instanceof UpstreamError) {
        const message = str(record({ body: error.body }, "body"), "message");
        throw new Error(message || fallbackMessage(error.status), { cause: error });
      }
      throw error;
    }
  }
}

function fallbackMessage(status: number): string {
  if (status === 429) return "LI.FI is rate limiting requests. Wait a moment and try again.";
  if (status >= 500) return `LI.FI is temporarily unavailable (${String(status)})`;
  return `No swap route available (${String(status)})`;
}
