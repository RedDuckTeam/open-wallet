// Wire paths in one place, shared by the API (route registration) and the
// extension client (request URLs) so they never drift.
export const API_ROUTES = {
  tokens: "/v1/tokens",
  tokensSearch: "/v1/tokens/search",
  tokensSearchSolana: "/v1/tokens/search/solana",
  nfts: "/v1/nfts",
  pricesNative: "/v1/prices/native",
  pricesTokens: "/v1/prices/tokens",
  swapQuote: "/v1/swap/quote",
  swapQuoteSolana: "/v1/swap/quote/solana",
  swapBuildSolana: "/v1/swap/build/solana",
} as const;
