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
  SlippageExceeded: "slippage-exceeded",
  QuoteExpired: "quote-expired",
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

// The active account's ERC-4337 state on the active network, flattened for
// the UI. `supported` is false when the network has no bundler configured —
// every other field is then meaningless and the UI shows the capability as
// unavailable rather than as "not upgraded yet".
export interface SmartAccountView {
  readonly supported: boolean;
  // The endpoints in effect, with any user override applied. Populated even
  // when `supported` is false — an empty bundler is *why* it's unsupported,
  // so the settings UI has to be able to show and fill the field in exactly
  // that state.
  readonly bundlerUrl: string;
  readonly hasCustomBundler: boolean;
  readonly paymasterUrl: string;
  readonly hasCustomPaymaster: boolean;
  readonly kind: string;
  readonly address: string;
  readonly owner: string;
  // True for EIP-7702: the smart account *is* the EOA, so there's no second
  // address and no balance to migrate.
  readonly sharesOwnerAddress: boolean;
  // Already usable as a smart account: deployed, or delegated to our implementation.
  readonly active: boolean;
  // Delegated, but to a different wallet's implementation — a real state the
  // UI must not silently present as "upgrade available".
  readonly delegatedElsewhere: boolean;
  readonly entryPoint: string;
  readonly entryPointVersion: string;
}

// A prepared batch's cost, as the approval UI needs it. `maxCostWei` is
// ERC-4337's required prefund; when `sponsored`, a paymaster pays it instead
// of the account.
export interface PreparedCallsView {
  // Opaque handle to the User Operation the background is holding. The
  // operation itself never crosses the wire: it's full of bigints, and
  // re-preparing it on send would let the approved numbers drift from the
  // sent ones.
  readonly id: string;
  readonly maxCostWei: string;
  readonly sponsored: boolean;
}

// A settled User Operation. `success` is the operation's own outcome, not the
// carrying transaction's — a reverted operation rides in a successful bundle.
export interface CallsReceiptView {
  readonly userOpHash: string;
  readonly transactionHash: string;
  readonly success: boolean;
  readonly explorerUrl: string;
}

// One NFT the active account holds. `tokenId` and `balance` are decimal
// strings, not numbers: uint256 ids routinely exceed Number.MAX_SAFE_INTEGER,
// and a rounded id addresses a different token.
export interface NftView {
  readonly standard: string;
  readonly contract: string;
  readonly tokenId: string;
  readonly name: string | null;
  readonly collection: string | null;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly balance: string;
}

export interface NftListView {
  readonly items: readonly NftView[];
  // False when no indexer answered, so the list holds only manually added
  // NFTs. The UI must say so — otherwise an unconfigured wallet looks
  // identical to an empty one.
  readonly indexed: boolean;
  // False on non-EVM networks, which have no ERC-721/1155 to list.
  readonly supported: boolean;
  // Whether the user allowed the backend indexer to be queried at all.
  readonly autodetect: boolean;
  // Whether NFT images may be fetched from their (third-party) hosts.
  readonly displayMedia: boolean;
  // Opaque cursor for the next page, or null at the end.
  readonly nextCursor: string | null;
}

// An EIP-6551 account bound to one NFT. The address exists before deployment —
// it can receive assets while counterfactual — which is why the two facts are
// reported separately.
export interface TokenBoundAccountView {
  readonly address: string;
  readonly deployed: boolean;
  // Base units. The account can hold funds before it's deployed, so a
  // non-zero balance on an undeployed account is a normal, real state.
  readonly nativeBalanceWei: string;
}

// One metadata trait. Fetched on demand for the detail screen rather than
// carried in the list: attributes come from the token's own metadata document,
// which indexers report inconsistently or not at all.
export interface NftAttributeView {
  readonly trait: string;
  readonly value: string;
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
  // EIP-5792 wallet_sendCalls: a batch executed atomically as one User Operation.
  SendCalls: "send-calls",
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

// A batch awaiting approval. Priced before the window opens, so the user
// approves the same User Operation that gets sent — see `prepareCalls`.
export interface DappBatchView {
  readonly calls: readonly DappTxView[];
  readonly maxCostWei: string;
  readonly sponsored: boolean;
  // True when this batch also turns the account into a smart account. EIP-5792
  // permits a wallet to upgrade on demand (that's what `atomic: "ready"`
  // advertises), but it changes the account permanently, so it is never left
  // implicit on the approval screen.
  readonly upgradesAccount: boolean;
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
  // wallet_sendCalls batch, priced.
  readonly batch: DappBatchView | null;
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

  // Swaps (same-chain: LI.FI on EVM, Jupiter on Solana)
  swapTokens(input: { query: string }): SwapTokenView[];
  // Percent (0.5 means 0.5%), validated against the bounds in
  // background/slippage.ts; set echoes the normalized value back.
  getSwapSlippage(): { pct: number };
  setSwapSlippage(input: { pct: number }): { pct: number };
  getSwapQuote(input: { from: SwapTokenRef; to: SwapTokenRef; amount: string }): SwapQuoteView;
  executeSwap(input: { execution: SwapExecutionView }): SendResult;

  // Smart account (ERC-4337)
  getSmartAccount(): SmartAccountView;
  // Prepares the User Operation that upgrades this account (an empty batch:
  // the EIP-7702 authorization rides along with it), priced but not sent.
  prepareSmartAccountUpgrade(): PreparedCallsView;
  // Signs and submits a batch prepared earlier, by handle. Returns the User
  // Operation hash, which is not a transaction hash — the bundler decides
  // later which transaction carries it, so settlement is a separate step.
  sendPreparedCalls(input: { id: string }): { userOpHash: string };
  // Blocks until the bundler reports the operation settled, then reports the
  // transaction that carried it. Split from `sendPreparedCalls` so a slow
  // bundler can't turn a successful submission into a failed-looking send.
  awaitCalls(input: { userOpHash: string }): CallsReceiptView;
  // Clears the EIP-7702 delegation; the account goes back to a plain EOA.
  revertSmartAccount(): SendResult;
  setSmartAccountKind(input: { kind: string }): SmartAccountView;
  // Every implementation this build knows, for the picker.
  smartAccountKinds(): {
    id: string;
    label: string;
    sharesOwnerAddress: boolean;
    // False for kinds the wallet can't yet drive end to end. Reported rather
    // than hidden so the picker states why instead of silently offering a
    // choice that leads nowhere.
    available: boolean;
    note: string;
  }[];
  setNetworkBundler(input: { id: string; bundlerUrl: string }): SmartAccountView;
  resetNetworkBundler(input: { id: string }): SmartAccountView;
  setNetworkPaymaster(input: { id: string; paymasterUrl: string }): SmartAccountView;
  resetNetworkPaymaster(input: { id: string }): SmartAccountView;

  // NFTs (ERC-721 / ERC-1155)
  getNfts(input: { cursor?: string }): NftListView;
  // On-chain read of one token's metadata, including attributes.
  getNftDetail(input: { contract: string; tokenId: string }): NftAttributeView[];
  addNft(input: { contract: string; tokenId: string }): NftView;
  removeNft(input: { contract: string; tokenId: string }): void;
  setNftAutodetect(input: { enabled: boolean }): NftListView;
  setNftMedia(input: { enabled: boolean }): NftListView;
  sendNft(input: {
    contract: string;
    tokenId: string;
    standard: string;
    to: string;
    amount?: string;
  }): SendResult;
  // EIP-6551
  getTokenBoundAccount(input: { contract: string; tokenId: string }): TokenBoundAccountView;
  deployTokenBoundAccount(input: { contract: string; tokenId: string }): SendResult;
  sendFromTokenBoundAccount(input: {
    contract: string;
    tokenId: string;
    to: string;
    amount: string;
    token?: string;
  }): SendResult;

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
  getSwapSlippage: "getSwapSlippage",
  setSwapSlippage: "setSwapSlippage",
  getSwapQuote: "getSwapQuote",
  executeSwap: "executeSwap",
  getSmartAccount: "getSmartAccount",
  prepareSmartAccountUpgrade: "prepareSmartAccountUpgrade",
  sendPreparedCalls: "sendPreparedCalls",
  awaitCalls: "awaitCalls",
  revertSmartAccount: "revertSmartAccount",
  setSmartAccountKind: "setSmartAccountKind",
  smartAccountKinds: "smartAccountKinds",
  setNetworkBundler: "setNetworkBundler",
  resetNetworkBundler: "resetNetworkBundler",
  setNetworkPaymaster: "setNetworkPaymaster",
  resetNetworkPaymaster: "resetNetworkPaymaster",
  getNfts: "getNfts",
  getNftDetail: "getNftDetail",
  addNft: "addNft",
  removeNft: "removeNft",
  setNftAutodetect: "setNftAutodetect",
  setNftMedia: "setNftMedia",
  sendNft: "sendNft",
  getTokenBoundAccount: "getTokenBoundAccount",
  deployTokenBoundAccount: "deployTokenBoundAccount",
  sendFromTokenBoundAccount: "sendFromTokenBoundAccount",
  getConnections: "getConnections",
  activeSiteConnection: "activeSiteConnection",
  disconnectSite: "disconnectSite",
  disconnectAllSites: "disconnectAllSites",
  dappPendingRequest: "dappPendingRequest",
  dappApproveRequest: "dappApproveRequest",
  dappRejectRequest: "dappRejectRequest",
} as const satisfies { readonly [K in keyof ProtocolMap]: K };
