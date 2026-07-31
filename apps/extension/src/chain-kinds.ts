import { ChainKind } from "./messaging/protocol.js";

// Per-chain-kind facts that used to live as separate ad hoc lookups/switches
// scattered across config/networks.ts, background/icons.ts, and two UI
// screens (one keyed by native-currency symbol, one a plain array, one an
// inline ternary). None of those were checked against each other, so a new
// ChainKind could silently miss one of them (e.g. a missing icons.ts entry
// just drops icons at runtime instead of failing to build).
//
// `Record<ChainKind, ChainKindMeta>` fixes that: TypeScript requires every
// `ChainKind` to have an entry here, so adding a chain kind without filling
// in its row is a compile error, not a silent runtime gap. This deliberately
// does NOT try to also centralize `buildAdapter`/`isValidAddress`/`feeReserve`
// in background/chains.ts or `txExplorerUrl` in config/networks.ts — those
// are already `switch` statements over the same closed `NetworkConfig` union,
// which TypeScript already refuses to compile if a case is missing, so
// there's nothing to fix there.
export interface ChainKindMeta {
  readonly label: string;
  // Display order in the Networks screen (lower first).
  readonly order: number;
  // Trust Wallet asset-repo folder for this kind's native currency icon.
  readonly nativeIconSlug: string;
  readonly supportsTokens: boolean;
  // Whether users can add their own custom networks of this kind.
  readonly supportsCustomNetworks: boolean;
  // Label for the per-network endpoint field in the edit-network screen.
  readonly endpointLabel: string;
}

export const CHAIN_KINDS: Record<ChainKind, ChainKindMeta> = {
  [ChainKind.Evm]: {
    label: "Ethereum",
    order: 0,
    nativeIconSlug: "ethereum",
    supportsTokens: true,
    supportsCustomNetworks: true,
    endpointLabel: "RPC URL",
  },
  [ChainKind.Bitcoin]: {
    label: "Bitcoin",
    order: 1,
    nativeIconSlug: "bitcoin",
    supportsTokens: false,
    supportsCustomNetworks: false,
    endpointLabel: "Indexer URL",
  },
  [ChainKind.Solana]: {
    label: "Solana",
    order: 2,
    nativeIconSlug: "solana",
    supportsTokens: true,
    supportsCustomNetworks: false,
    endpointLabel: "RPC URL",
  },
};

// Every ChainKind, in display order — derived from CHAIN_KINDS itself so a
// new kind can't be added to the table and forgotten here.
export const CHAIN_KIND_ORDER: readonly ChainKind[] = (
  Object.keys(CHAIN_KINDS) as ChainKind[]
).sort((a, b) => CHAIN_KINDS[a].order - CHAIN_KINDS[b].order);
