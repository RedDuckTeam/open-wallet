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
  // ERC-4337 bundler for every EVM chain, {chainId} as the per-chain
  // placeholder (Pimlico/Alchemy style). Keyed by chain id rather than by the
  // slug `rpcUrl` uses, because that's how every bundler addresses a chain.
  // Empty disables smart accounts: unlike an RPC there is no public bundler
  // to fall back to, and pretending otherwise would fail at send time
  // instead of at the capability check.
  bundlerUrl: read(import.meta.env.WXT_BUNDLER_URL, ""),
  // ERC-7677 paymaster for sponsored (gasless) User Operations. Same
  // {chainId} placeholder. Empty means self-funded: the account pays its own gas.
  paymasterUrl: read(import.meta.env.WXT_PAYMASTER_URL, ""),
  // OpenWallet API (apps/api): serves token lists, prices, and swap quotes.
  // Self-hostable; keys for CoinGecko/LI.FI live there, not in the extension.
  apiBaseUrl: read(import.meta.env.WXT_API_URL, "http://localhost:3001"),
} as const;
