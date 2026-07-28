// Build-time config (WXT inlines import.meta.env.WXT_* at build). All optional,
// set via .env (see .env.example).
function read(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export const env = {
  // One RPC URL for every network, {network} as the per-chain placeholder
  // (Alchemy/Infura style). Empty falls back to public endpoints.
  rpcUrl: read(import.meta.env.WXT_RPC_URL, ""),
  etherscanApiKey: read(import.meta.env.WXT_ETHERSCAN_API_KEY, ""),
  // OpenWallet API (apps/api): serves token lists, prices, and swap quotes.
  // Self-hostable; keys for CoinGecko/LI.FI live there, not in the extension.
  apiBaseUrl: read(import.meta.env.WXT_API_URL, "http://localhost:3001"),
} as const;
