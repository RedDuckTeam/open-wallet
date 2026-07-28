import { getAddress } from "viem";
import { ChainKind } from "../messaging/protocol.js";
import { CHAIN_KINDS } from "../chain-kinds.js";
import type { NetworkConfig } from "../config/networks.js";

// Deterministic keyless logo URLs (Trust Wallet assets). No fetch: the UI loads
// them directly and falls back to a letter placeholder on a miss.
const ASSETS = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains";

// Trust Wallet chain folder for a network's tokens (built-in EVM networks).
// Per network id, not per kind: unlike the native icon (one folder per chain
// kind, via CHAIN_KINDS), Trust Wallet's per-EVM-network folders are their
// own external naming convention with no derivable relationship to anything
// in this codebase, so a new EVM network genuinely needs its own entry here.
const CHAIN_SLUG: Record<string, string> = {
  ethereum: "ethereum",
  base: "base",
  arbitrum: "arbitrum",
  sepolia: "ethereum",
};

export function nativeIconUrl(network: NetworkConfig): string | null {
  return `${ASSETS}/${CHAIN_KINDS[network.kind].nativeIconSlug}/info/logo.png`;
}

export function tokenIconUrl(network: NetworkConfig, address: string): string | null {
  if (network.kind !== ChainKind.Evm) return null;
  const slug = CHAIN_SLUG[network.id];
  if (!slug) return null;
  try {
    // Trust Wallet folders are EIP-55 checksummed.
    return `${ASSETS}/${slug}/assets/${getAddress(address)}/logo.png`;
  } catch {
    return null;
  }
}
