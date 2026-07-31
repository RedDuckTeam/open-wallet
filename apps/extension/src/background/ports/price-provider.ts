// Port for a USD price source. Best-effort: unavailable prices come back as
// null/absent, never throwing, so a rate-limited feed won't break balances.
export interface PriceProvider {
  nativeUsd(coingeckoId: string): Promise<number | null>;
  // Keys are lowercased addresses.
  tokensUsd(platform: string, addresses: readonly string[]): Promise<Record<string, number>>;
}
