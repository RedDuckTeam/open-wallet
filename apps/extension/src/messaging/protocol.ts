import type { SwapExecutionData, SwapQuoteResponse } from "@openwallet/api-contract";

// Shared string enums. Const object + derived union (no TS `enum`); values are
// plain strings so they serialize over the wire and match the core's coin ids.

export const WalletState = {
  NoVault: "no-vault",
  Locked: "locked",
  Unlocked: "unlocked",
} as const;
export type WalletState = (typeof WalletState)[keyof typeof WalletState];

export const ChainKind = {
  Evm: "evm",
  Solana: "solana",
  Bitcoin: "bitcoin",
} as const;
export type ChainKind = (typeof ChainKind)[keyof typeof ChainKind];

export const AccountType = {
  Hd: "hd",
  Imported: "imported",
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const AssetKind = {
  Native: "native",
  Token: "token",
} as const;
export type AssetKind = (typeof AssetKind)[keyof typeof AssetKind];

// Native currency's asset id; tokens use their contract address.
export const NATIVE_ASSET_ID = "native";

// Set by the background, read by the UI for tailored error copy. The UI can't
// instanceof the core error classes without pulling them into the popup bundle,
// so the code rides on the error's `code` across the wire.
export const WalletErrorCode = {
  // Validation
  InvalidAddress: "invalid-address",
  InvalidMnemonic: "invalid-mnemonic",
  InvalidPrivateKey: "invalid-private-key",
  // Auth / vault
  WrongPassword: "wrong-password",
  Locked: "locked",
  // Funds / transaction
  InsufficientFunds: "insufficient-funds",
  FeeTooLow: "fee-too-low",
  NonceTooLow: "nonce-too-low",
  TxUnderpriced: "tx-underpriced",
  GasEstimationFailed: "gas-estimation-failed",
  // Connectivity
  NetworkError: "network-error",
  RateLimited: "rate-limited",
  Timeout: "timeout",
  RpcError: "rpc-error",
  // Fallback
  Unknown: "unknown",
} as const;
export type WalletErrorCode = (typeof WalletErrorCode)[keyof typeof WalletErrorCode];

// id is `hd:<index>` or `imported:<coin>:<address>`; address/name are for the active network.
export interface AccountView {
  readonly id: string;
  readonly address: string;
  readonly name: string;
  readonly type: AccountType;
  readonly hidden: boolean;
}

export interface NetworkView {
  readonly id: string;
  readonly kind: ChainKind;
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly supportsTokens: boolean;
  readonly color: string;
  // Primary mainnet of its family; heads the group in the switcher.
  readonly isPrimary: boolean;
  readonly isTestnet: boolean;
  readonly isCustom: boolean;
  // Endpoint in effect, with any custom override applied.
  readonly rpcUrl: string;
  readonly hasCustomRpc: boolean;
}

export interface AddNetworkInput {
  readonly name: string;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly symbol: string;
  readonly explorerUrl?: string;
}

// balanceWei is raw base units; the UI formats it.
export interface AssetView {
  readonly id: string;
  readonly kind: AssetKind;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly address: string | null;
  readonly balanceWei: string;
  // null when no price is available (e.g. testnets).
  readonly priceUsd: number | null;
  // Logo URL, or null to fall back to a letter placeholder.
  readonly iconUrl: string | null;
}

export interface WalletStatus {
  readonly state: WalletState;
  readonly account: AccountView | null;
  readonly accounts: readonly AccountView[];
  readonly network: NetworkView;
  readonly networks: readonly NetworkView[];
}

export interface SendResult {
  readonly hash: string;
  readonly explorerUrl: string;
}

// A ready-to-sign swap, built by the backend off the aggregator route. The UI
// holds it opaquely and passes it back to executeSwap; only the background signs.
// Amounts are decimal base-unit strings. These are the same wire shapes the
// backend validates against (packages/api-contract/src/swap.ts) — aliased
// under the "View" names this file already used, rather than re-declared, so
// the two can't drift out of sync with each other.
export type SwapExecutionView = SwapExecutionData;
export type SwapQuoteView = SwapQuoteResponse;

// A token offered in the swap picker (from the backend token list). `address`
// is the contract address (zero address for native).
export interface SwapTokenView {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly iconUrl: string | null;
}

// Either side of a swap: null address means the native asset.
export interface SwapTokenRef {
  readonly address: string | null;
  readonly decimals: number;
}

// A dApp origin the user has connected to.
export interface ConnectionView {
  readonly origin: string;
  readonly name: string;
  readonly iconUrl: string | null;
  readonly connectedAt: number;
}

// Whether the popup's active browser tab is a connected dApp, plus the total
// number of connected sites (for the header indicator).
export interface ActiveSiteView {
  readonly origin: string | null;
  readonly connected: boolean;
  readonly count: number;
}

export const DappRequestKind = {
  Connect: "connect",
  SignMessage: "sign-message",
  SignTypedData: "sign-typed-data",
  SendTransaction: "send-transaction",
  SwitchChain: "switch-chain",
} as const;
export type DappRequestKind = (typeof DappRequestKind)[keyof typeof DappRequestKind];

// A pending dApp transaction, for the approval screen. value/gas are base units.
export interface DappTxView {
  readonly to: string | null;
  readonly value: string;
  readonly data: string;
  readonly gas: string | null;
}

// A pending dApp request awaiting the user's approval, shown in the approval
// window. Only the fields relevant to `kind` are populated.
export interface DappRequestView {
  readonly id: string;
  readonly kind: DappRequestKind;
  readonly origin: string;
  readonly name: string;
  readonly iconUrl: string | null;
  // The EVM address that will act.
  readonly account: string;
  readonly chainId: number;
  readonly networkName: string;
  // personal_sign text or pretty-printed typed data.
  readonly message: string | null;
  readonly tx: DappTxView | null;
  // wallet_switchEthereumChain target name.
  readonly chainName: string | null;
}

// Every request the popup can make of the background. JSON-only boundary:
// amounts cross as strings (balances as base-unit decimals, sends as human).
export interface ProtocolMap {
  getStatus(): WalletStatus;
  createWallet(input: { password: string }): { mnemonic: string };
  importWallet(input: { mnemonic: string; password: string }): void;
  unlock(input: { password: string }): void;
  lock(): void;
  reset(): void;
  revealMnemonic(input: { password: string }): { mnemonic: string };

  // Accounts
  addAccount(): AccountView;
  selectAccount(input: { id: string }): void;
  hideAccount(input: { id: string }): AccountView[];
  unhideAccount(input: { id: string }): AccountView[];
  importAccount(input: { privateKey: string; password: string }): void;
  removeAccount(input: { id: string; password: string }): void;

  // Networks
  selectNetwork(input: { id: string }): void;
  addNetwork(input: AddNetworkInput): NetworkView[];
  removeNetwork(input: { id: string }): NetworkView[];
  setNetworkRpc(input: { id: string; rpcUrl: string }): NetworkView[];
  resetNetworkRpc(input: { id: string }): NetworkView[];

  // Assets
  getAssets(): AssetView[];
  addToken(input: { address: string }): AssetView;
  removeToken(input: { address: string }): void;

  // Transfers
  resolveRecipient(input: { value: string }): { address: string | null };
  send(input: { assetId: string; to: string; amount: string }): SendResult;
  // Native base units to keep in reserve for gas (for the "Max" button).
  getFeeReserve(input: { intent: "transfer" | "swap" }): { reserveWei: string };

  // Swaps (same-chain, EVM only for now)
  swapTokens(input: { query: string }): SwapTokenView[];
  getSwapQuote(input: { from: SwapTokenRef; to: SwapTokenRef; amount: string }): SwapQuoteView;
  executeSwap(input: { execution: SwapExecutionView }): SendResult;

  // dApp connections (popup management)
  getConnections(): ConnectionView[];
  activeSiteConnection(): ActiveSiteView;
  disconnectSite(input: { origin: string }): ConnectionView[];
  disconnectAllSites(): ConnectionView[];

  // dApp approval window (opened by the background for a pending request)
  dappPendingRequest(input: { id: string }): DappRequestView | null;
  dappApproveRequest(input: { id: string }): void;
  dappRejectRequest(input: { id: string }): void;
}

// Message names in one place. `satisfies` keeps this exact with ProtocolMap:
// adding a method without an entry here (or vice versa) fails to compile.
export const Message = {
  getStatus: "getStatus",
  createWallet: "createWallet",
  importWallet: "importWallet",
  unlock: "unlock",
  lock: "lock",
  reset: "reset",
  revealMnemonic: "revealMnemonic",
  addAccount: "addAccount",
  selectAccount: "selectAccount",
  hideAccount: "hideAccount",
  unhideAccount: "unhideAccount",
  importAccount: "importAccount",
  removeAccount: "removeAccount",
  selectNetwork: "selectNetwork",
  addNetwork: "addNetwork",
  removeNetwork: "removeNetwork",
  setNetworkRpc: "setNetworkRpc",
  resetNetworkRpc: "resetNetworkRpc",
  getAssets: "getAssets",
  addToken: "addToken",
  removeToken: "removeToken",
  resolveRecipient: "resolveRecipient",
  send: "send",
  getFeeReserve: "getFeeReserve",
  swapTokens: "swapTokens",
  getSwapQuote: "getSwapQuote",
  executeSwap: "executeSwap",
  getConnections: "getConnections",
  activeSiteConnection: "activeSiteConnection",
  disconnectSite: "disconnectSite",
  disconnectAllSites: "disconnectAllSites",
  dappPendingRequest: "dappPendingRequest",
  dappApproveRequest: "dappApproveRequest",
  dappRejectRequest: "dappRejectRequest",
} as const satisfies { readonly [K in keyof ProtocolMap]: K };
