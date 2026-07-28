import {
  API_ROUTES,
  NativePriceResponse,
  SolanaTokenListResponse,
  SwapQuoteResponse,
  TokenListResponse,
  TokenPriceResponse,
  type SwapQuoteResponse as SwapQuote,
  type SolanaTokenInfo,
  type TokenInfo,
} from "@openwallet/api-contract";
import type { SwapQuoteParams } from "@openwallet/lifi-client";
import type { SolanaSwapQuoteParams } from "@openwallet/jupiter-client";

export type SwapQuoteRequest = SwapQuoteParams;
export type SolanaSwapQuoteRequest = SolanaSwapQuoteParams;

// Typed client for the OpenWallet API. Responses are validated with the shared
// zod contract, so a shape change upstream surfaces as an error here, not a
// silent undefined downstream. The only place the extension talks to the backend.
export class BackendClient {
  constructor(private readonly baseUrl: string) {}

  tokens(chainId: number): Promise<TokenInfo[]> {
    return this.#get(TokenListResponse, API_ROUTES.tokens, { chainId: String(chainId) }).then(
      (r) => r.tokens,
    );
  }

  searchTokens(chainId: number, query: string, limit: number): Promise<TokenInfo[]> {
    return this.#get(TokenListResponse, API_ROUTES.tokensSearch, {
      chainId: String(chainId),
      q: query,
      limit: String(limit),
    }).then((r) => r.tokens);
  }

  nativePrices(ids: readonly string[]): Promise<Record<string, number>> {
    if (ids.length === 0) return Promise.resolve({});
    return this.#get(NativePriceResponse, API_ROUTES.pricesNative, { ids: ids.join(",") }).then(
      (r) => r.prices,
    );
  }

  tokenPrices(platform: string, addresses: readonly string[]): Promise<Record<string, number>> {
    if (addresses.length === 0) return Promise.resolve({});
    return this.#get(TokenPriceResponse, API_ROUTES.pricesTokens, {
      platform,
      addresses: addresses.join(","),
    }).then((r) => r.prices);
  }

  swapQuote(request: SwapQuoteRequest): Promise<SwapQuote> {
    return this.#get(SwapQuoteResponse, API_ROUTES.swapQuote, {
      chainId: String(request.chainId),
      fromAddress: request.fromAddress,
      fromToken: request.fromToken,
      toToken: request.toToken,
      fromAmount: request.fromAmount,
      slippage: String(request.slippage),
    });
  }

  searchSolanaTokens(query: string, limit: number): Promise<SolanaTokenInfo[]> {
    return this.#get(SolanaTokenListResponse, API_ROUTES.tokensSearchSolana, {
      q: query,
      limit: String(limit),
    }).then((r) => r.tokens);
  }

  solanaSwapQuote(request: SolanaSwapQuoteRequest): Promise<SwapQuote> {
    return this.#get(SwapQuoteResponse, API_ROUTES.swapQuoteSolana, {
      fromAddress: request.fromAddress,
      fromToken: request.fromToken,
      toToken: request.toToken,
      fromAmount: request.fromAmount,
      slippage: String(request.slippage),
    });
  }

  async #get<T>(
    schema: { parse(value: unknown): T },
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetch(url);
    if (!response.ok) throw await httpError(response);
    return schema.parse(await response.json());
  }
}

// A 4xx from the API carries a message array (zod validation) or a plain string.
async function httpError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => null)) as unknown;
  const message =
    typeof body === "object" && body !== null && "message" in body
      ? (body as { message: unknown }).message
      : null;
  const text = Array.isArray(message) ? message.join(", ") : String(message ?? response.status);
  return new Error(text);
}
