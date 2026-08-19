import {
  API_ROUTES,
  NativePriceResponse,
  NftListResponse,
  SolanaSwapBuildResponse,
  SolanaTokenListResponse,
  SwapQuoteResponse,
  TokenListResponse,
  TokenPriceResponse,
  type SwapQuoteResponse as SwapQuote,
  type NftListResponse as NftList,
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

  // Holdings enumeration. Returns the whole envelope, not just the array:
  // `indexed` distinguishes "this account owns nothing" from "no indexer is
  // configured", and the caller renders those very differently.
  nfts(chainId: number, owner: string, limit: number, cursor?: string): Promise<NftList> {
    return this.#get(NftListResponse, API_ROUTES.nfts, {
      chainId: String(chainId),
      owner,
      limit: String(limit),
      ...(cursor ? { cursor } : {}),
    });
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

  /**
   * Turns a previously quoted Solana route into a signable transaction.
   * Called at confirmation time, not quote time — the result embeds a fresh
   * blockhash and is only valid for about a minute.
   */
  buildSolanaSwap(route: Record<string, unknown>, userPublicKey: string): Promise<string> {
    return this.#post(SolanaSwapBuildResponse, API_ROUTES.swapBuildSolana, {
      route,
      userPublicKey,
    }).then((r) => r.transactionBase64);
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

  async #post<T>(schema: { parse(value: unknown): T }, path: string, body: unknown): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await httpError(response);
    return schema.parse(await response.json());
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
