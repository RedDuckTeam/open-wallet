import { defineChain, type Chain } from "viem";
import { arbitrum, base, mainnet, sepolia } from "viem/chains";
import { networks as bitcoinNetworks, type Network as BitcoinNetworkParams } from "bitcoinjs-lib";
import { bitcoinTestnetCoin } from "@openwallet/chain-bitcoin";
import { ChainKind } from "../messaging/protocol.js";
import { CHAIN_KINDS } from "../chain-kinds.js";
import { env } from "./env.js";

// CoinGecko ids to price a network's assets (absent on testnets).
export interface CoinGeckoConfig {
  readonly nativeId: string;
  readonly platform: string;
}

interface BaseNetwork {
  readonly id: string;
  readonly name: string;
  readonly nativeSymbol: string;
  readonly nativeDecimals: number;
  readonly color: string;
  // Core coin id for derivation; defaults to kind. Bitcoin testnet overrides it.
  readonly coinId?: string;
  // Primary mainnet of its family; shown at the top, the rest collapse.
  readonly primary?: boolean;
  readonly testnet?: boolean;
  readonly coingecko?: CoinGeckoConfig;
}

export interface EvmNetwork extends BaseNetwork {
  readonly kind: typeof ChainKind.Evm;
  readonly chain: Chain;
  readonly rpcUrl: string;
}

export interface SolanaNetwork extends BaseNetwork {
  readonly kind: typeof ChainKind.Solana;
  readonly rpcUrl: string;
  // Explorer cluster suffix, e.g. "?cluster=devnet" ("" for mainnet).
  readonly explorerCluster: string;
}

export interface BitcoinNetwork extends BaseNetwork {
  readonly kind: typeof ChainKind.Bitcoin;
  // Bitcoin has no generic JSON-RPC; reads/broadcast go through an Esplora indexer.
  readonly esploraUrl: string;
  readonly explorerBase: string;
  readonly params: BitcoinNetworkParams;
}

export type NetworkConfig = EvmNetwork | SolanaNetwork | BitcoinNetwork;

// env RPC template with {network} placeholder; empty falls back to a public node.
function evmRpc(slug: string, publicFallback: string): string {
  return env.rpcUrl ? env.rpcUrl.replaceAll("{network}", slug) : publicFallback;
}

export const NETWORKS: readonly NetworkConfig[] = [
  {
    kind: ChainKind.Evm,
    id: "ethereum",
    color: "#627EEA",
    name: "Ethereum",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    primary: true,
    chain: mainnet,
    rpcUrl: evmRpc("eth-mainnet", "https://ethereum-rpc.publicnode.com"),
    coingecko: { nativeId: "ethereum", platform: "ethereum" },
  },
  {
    kind: ChainKind.Evm,
    id: "base",
    color: "#0052FF",
    name: "Base",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    chain: base,
    rpcUrl: evmRpc("base-mainnet", "https://base-rpc.publicnode.com"),
    coingecko: { nativeId: "ethereum", platform: "base" },
  },
  {
    kind: ChainKind.Evm,
    id: "arbitrum",
    color: "#28A0F0",
    name: "Arbitrum",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    chain: arbitrum,
    rpcUrl: evmRpc("arb-mainnet", "https://arbitrum-one-rpc.publicnode.com"),
    coingecko: { nativeId: "ethereum", platform: "arbitrum-one" },
  },
  {
    kind: ChainKind.Evm,
    id: "sepolia",
    color: "#B0B4C0",
    name: "Sepolia",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    testnet: true,
    chain: sepolia,
    rpcUrl: evmRpc("eth-sepolia", "https://ethereum-sepolia-rpc.publicnode.com"),
  },
  {
    kind: ChainKind.Solana,
    id: "solana",
    color: "#9945FF",
    name: "Solana",
    nativeSymbol: "SOL",
    nativeDecimals: 9,
    primary: true,
    // The official mainnet-beta endpoint 403s browser requests; PublicNode allows CORS.
    rpcUrl: "https://solana-rpc.publicnode.com",
    explorerCluster: "",
    coingecko: { nativeId: "solana", platform: "solana" },
  },
  {
    kind: ChainKind.Solana,
    id: "solana-devnet",
    color: "#14F195",
    name: "Solana Devnet",
    nativeSymbol: "SOL",
    nativeDecimals: 9,
    testnet: true,
    rpcUrl: "https://api.devnet.solana.com",
    explorerCluster: "?cluster=devnet",
  },
  {
    kind: ChainKind.Bitcoin,
    id: "bitcoin",
    color: "#F7931A",
    name: "Bitcoin",
    nativeSymbol: "BTC",
    nativeDecimals: 8,
    primary: true,
    esploraUrl: "https://blockstream.info/api",
    explorerBase: "https://blockstream.info",
    params: bitcoinNetworks.bitcoin,
    coingecko: { nativeId: "bitcoin", platform: "bitcoin" },
  },
  {
    kind: ChainKind.Bitcoin,
    coinId: bitcoinTestnetCoin.id,
    id: "bitcoin-testnet",
    color: "#C9A66B",
    name: "Bitcoin Testnet",
    nativeSymbol: "tBTC",
    nativeDecimals: 8,
    testnet: true,
    esploraUrl: "https://blockstream.info/testnet/api",
    explorerBase: "https://blockstream.info/testnet",
    params: bitcoinNetworks.testnet,
  },
];

// Sepolia by default, so send/receive works with free faucet funds.
export const DEFAULT_NETWORK_ID = "sepolia";

const CUSTOM_NETWORK_COLOR = "#6B7280";

// A user-imported EVM network, as persisted in settings.
export interface CustomEvmNetworkInput {
  readonly id: string;
  readonly name: string;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly symbol: string;
  readonly explorerUrl?: string;
}

// Any EVM chain works from a chain id + RPC (viem is generic).
export function buildEvmNetwork(input: CustomEvmNetworkInput): EvmNetwork {
  const chain = defineChain({
    id: input.chainId,
    name: input.name,
    nativeCurrency: { name: input.symbol, symbol: input.symbol, decimals: 18 },
    rpcUrls: { default: { http: [input.rpcUrl] } },
    ...(input.explorerUrl
      ? { blockExplorers: { default: { name: input.name, url: input.explorerUrl } } }
      : {}),
  });
  return {
    kind: ChainKind.Evm,
    id: input.id,
    name: input.name,
    nativeSymbol: input.symbol,
    nativeDecimals: 18,
    color: CUSTOM_NETWORK_COLOR,
    chain,
    rpcUrl: input.rpcUrl,
  };
}

// The endpoint a network reads from (field differs by kind).
export function rpcEndpoint(network: NetworkConfig): string {
  return network.kind === ChainKind.Bitcoin ? network.esploraUrl : network.rpcUrl;
}

/**
 * The ERC-4337 bundler for a network, or null when smart accounts aren't
 * available on it.
 *
 * Derived rather than stored on `EvmNetwork` so a user-imported custom chain
 * gets bundler support on the same terms as a built-in one, with no per-network
 * literal to keep in sync. Non-EVM networks are always null — User Operations
 * and EntryPoints are an EVM-family concept, and Solana/Bitcoin have no
 * equivalent to route through.
 */
export function bundlerEndpoint(network: NetworkConfig): string | null {
  if (network.kind !== ChainKind.Evm || !env.bundlerUrl) return null;
  return env.bundlerUrl.replaceAll("{chainId}", String(network.chain.id));
}

/** The ERC-7677 paymaster for a network, or null when User Operations are self-funded. */
export function paymasterEndpoint(network: NetworkConfig): string | null {
  if (network.kind !== ChainKind.Evm || !env.paymasterUrl) return null;
  return env.paymasterUrl.replaceAll("{chainId}", String(network.chain.id));
}

// A copy of network with its endpoint replaced (custom-RPC override).
export function withRpcEndpoint(network: NetworkConfig, endpoint: string): NetworkConfig {
  return network.kind === ChainKind.Bitcoin
    ? { ...network, esploraUrl: endpoint }
    : { ...network, rpcUrl: endpoint };
}

export function txExplorerUrl(network: NetworkConfig, hash: string): string {
  switch (network.kind) {
    case ChainKind.Evm: {
      const explorer = network.chain.blockExplorers?.default.url;
      return explorer ? `${explorer}/tx/${hash}` : "";
    }
    case ChainKind.Solana:
      return `https://explorer.solana.com/tx/${hash}${network.explorerCluster}`;
    case ChainKind.Bitcoin:
      return `${network.explorerBase}/tx/${hash}`;
  }
}

export function supportsTokens(network: NetworkConfig): boolean {
  return CHAIN_KINDS[network.kind].supportsTokens;
}

// Coin id for derivation: explicit coinId, or kind when they line up.
export function coinIdOf(network: NetworkConfig): string {
  return network.coinId ?? network.kind;
}
