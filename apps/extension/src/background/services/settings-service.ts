import { SmartAccountKind } from "@openwallet/chain-evm";
import {
  buildEvmNetwork,
  bundlerEndpoint,
  coinIdOf,
  paymasterEndpoint,
  DEFAULT_NETWORK_ID,
  ENS_NETWORK_ID,
  NETWORKS,
  withRpcEndpoint,
  type CustomEvmNetworkInput,
  type EvmNetwork,
  type NetworkConfig,
} from "../../config/networks.js";
import { hdAccountId, parseAccountId } from "../account-id.js";
import { DEFAULT_SLIPPAGE_PCT } from "../../slippage.js";
import { AccountType, ChainKind } from "../../messaging/protocol.js";
import type { Settings, SettingsStorage, TokenConfig } from "../../platform/settings-storage.js";

const DEFAULTS: Settings = {
  activeNetworkId: DEFAULT_NETWORK_ID,
  activeAccountId: hdAccountId(0),
  accountCount: 1,
  hiddenAccountIds: [],
  customTokens: {},
  customRpc: {},
  customNetworks: [],
  customBundler: {},
  customPaymaster: {},
  customNfts: {},
  autodetectNfts: false,
  displayNftMedia: true,
  smartAccountKind: SmartAccountKind.Simple7702,
  slippagePct: DEFAULT_SLIPPAGE_PCT,
};

// Contract addresses are case-insensitive; token ids are decimal strings and
// are not.
function sameNft(
  nft: { contract: string; tokenId: string },
  contract: string,
  tokenId: string,
): boolean {
  return nft.contract.toLowerCase() === contract.toLowerCase() && nft.tokenId === tokenId;
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const result: Record<string, T> = {};
  for (const k of Object.keys(record)) {
    if (k !== key) result[k] = record[k];
  }
  return result;
}

// Non-secret app state (active network/account, custom tokens/RPC/networks) and
// its persistence. Also assembles the effective network list (built-in + custom,
// each with its RPC override applied).
export class SettingsService {
  #settings: Settings = DEFAULTS;

  constructor(private readonly storage: SettingsStorage) {}

  async init(): Promise<void> {
    this.#settings = { ...DEFAULTS, ...(await this.storage.load()) };
  }

  get accountCount(): number {
    return this.#settings.accountCount;
  }

  get activeAccountId(): string {
    return this.#settings.activeAccountId;
  }

  hiddenAccountIds(): readonly string[] {
    return this.#settings.hiddenAccountIds;
  }

  isAccountHidden(id: string): boolean {
    return this.#settings.hiddenAccountIds.includes(id);
  }

  allNetworks(): NetworkConfig[] {
    const custom = this.#settings.customNetworks.map(buildEvmNetwork);
    return [...NETWORKS, ...custom].map((network) => {
      const override = this.#settings.customRpc[network.id];
      return override ? withRpcEndpoint(network, override) : network;
    });
  }

  network(id: string): NetworkConfig {
    const all = this.allNetworks();
    return all.find((network) => network.id === id) ?? all[0];
  }

  activeNetwork(): NetworkConfig {
    return this.network(this.#settings.activeNetworkId);
  }

  /**
   * The network ENS names resolve against — L1, whatever the active network
   * is (see `ENS_NETWORK_ID`). Taken from `allNetworks` rather than from the
   * static list so a user's custom RPC for that chain is honoured here too:
   * someone who set their own Ethereum endpoint because the public one is
   * rate limited should get name resolution through it as well.
   *
   * `null` when this build has no such network, which is a real possibility
   * for a fork that ships a different network list — callers must treat name
   * resolution as unavailable rather than assume it exists.
   */
  ensNetwork(): EvmNetwork | null {
    const network = this.allNetworks().find((entry) => entry.id === ENS_NETWORK_ID);
    return network?.kind === ChainKind.Evm ? network : null;
  }

  isCustomNetwork(id: string): boolean {
    return this.#settings.customNetworks.some((network) => network.id === id);
  }

  hasRpcOverride(id: string): boolean {
    return id in this.#settings.customRpc;
  }

  tokens(networkId: string): TokenConfig[] {
    return this.#settings.customTokens[networkId] ?? [];
  }

  async selectNetwork(id: string): Promise<void> {
    const network = this.network(id);
    const patch: Partial<Settings> = { activeNetworkId: network.id };
    // An imported account only exists on its own coin; switching to a network
    // with a different coin makes it invalid, so fall back to the primary HD account.
    const active = parseAccountId(this.#settings.activeAccountId);
    if (active.type === AccountType.Imported && active.coinId !== coinIdOf(network)) {
      patch.activeAccountId = hdAccountId(0);
    }
    await this.#update(patch);
  }

  async selectAccount(id: string): Promise<void> {
    await this.#update({ activeAccountId: id });
  }

  // Reveals the next HD account and makes it active. Returns its index.
  async addAccount(): Promise<number> {
    const index = this.#settings.accountCount;
    await this.#update({ accountCount: index + 1, activeAccountId: hdAccountId(index) });
    return index;
  }

  // Refuses to hide the active account, so there's always a visible one.
  async hideAccount(id: string): Promise<void> {
    if (id === this.#settings.activeAccountId || this.isAccountHidden(id)) return;
    await this.#update({ hiddenAccountIds: [...this.#settings.hiddenAccountIds, id] });
  }

  async unhideAccount(id: string): Promise<void> {
    await this.#update({
      hiddenAccountIds: this.#settings.hiddenAccountIds.filter((hidden) => hidden !== id),
    });
  }

  async addToken(networkId: string, token: TokenConfig): Promise<void> {
    const existing = this.tokens(networkId);
    if (existing.some((t) => t.address.toLowerCase() === token.address.toLowerCase())) return;
    await this.#update({
      customTokens: { ...this.#settings.customTokens, [networkId]: [...existing, token] },
    });
  }

  async removeToken(networkId: string, address: string): Promise<void> {
    const remaining = this.tokens(networkId).filter(
      (t) => t.address.toLowerCase() !== address.toLowerCase(),
    );
    await this.#update({
      customTokens: { ...this.#settings.customTokens, [networkId]: remaining },
    });
  }

  // Imports a custom EVM network and makes it active. Returns its generated id.
  async addNetwork(input: Omit<CustomEvmNetworkInput, "id">): Promise<string> {
    const id = `custom-${String(input.chainId)}-${Date.now().toString(36)}`;
    await this.#update({
      customNetworks: [...this.#settings.customNetworks, { ...input, id }],
      activeNetworkId: id,
    });
    return id;
  }

  async removeNetwork(id: string): Promise<void> {
    const patch: Partial<Settings> = {
      customNetworks: this.#settings.customNetworks.filter((network) => network.id !== id),
      customRpc: omitKey(this.#settings.customRpc, id),
      customBundler: omitKey(this.#settings.customBundler, id),
      customPaymaster: omitKey(this.#settings.customPaymaster, id),
      customNfts: omitKey(this.#settings.customNfts, id),
    };
    if (this.#settings.activeNetworkId === id) patch.activeNetworkId = DEFAULT_NETWORK_ID;
    await this.#update(patch);
  }

  /**
   * The bundler a network transacts through: a user override if set,
   * otherwise the built-in endpoint, or `null` when smart accounts aren't
   * available there. `null` is a real answer, not a failure — it's what the
   * capability check reports to dApps and the UI.
   */
  bundlerUrl(network: NetworkConfig): string | null {
    return this.#settings.customBundler[network.id] ?? bundlerEndpoint(network);
  }

  hasBundlerOverride(id: string): boolean {
    return id in this.#settings.customBundler;
  }

  /**
   * The ERC-7677 paymaster for a network, or `null` for self-funded User
   * Operations. A user-set endpoint wins over the build-time one, so
   * sponsorship can be turned on in a shipped build without rebuilding it.
   */
  paymasterUrl(network: NetworkConfig): string | null {
    return this.#settings.customPaymaster[network.id] ?? paymasterEndpoint(network);
  }

  hasPaymasterOverride(id: string): boolean {
    return id in this.#settings.customPaymaster;
  }

  /**
   * Falls back to EIP-7702 for an unrecognised persisted value rather than
   * throwing: settings written by a newer build must still load, and the
   * 7702 default is the one kind that can't strand funds at an address the
   * running build doesn't know how to reach.
   */
  smartAccountKind(): SmartAccountKind {
    const stored = this.#settings.smartAccountKind;
    const known = Object.values(SmartAccountKind).find((kind) => kind === stored);
    return known ?? SmartAccountKind.Simple7702;
  }

  async setSmartAccountKind(kind: SmartAccountKind): Promise<void> {
    await this.#update({ smartAccountKind: kind });
  }

  get slippagePct(): number {
    return this.#settings.slippagePct;
  }

  /** Stores an already-validated value — bounds are the caller's job (`validateSlippagePct`). */
  async setSlippagePct(pct: number): Promise<void> {
    await this.#update({ slippagePct: pct });
  }

  async setBundler(id: string, url: string): Promise<void> {
    await this.#update({ customBundler: { ...this.#settings.customBundler, [id]: url } });
  }

  async resetBundler(id: string): Promise<void> {
    await this.#update({ customBundler: omitKey(this.#settings.customBundler, id) });
  }

  get autodetectNfts(): boolean {
    return this.#settings.autodetectNfts;
  }

  async setAutodetectNfts(enabled: boolean): Promise<void> {
    await this.#update({ autodetectNfts: enabled });
  }

  get displayNftMedia(): boolean {
    return this.#settings.displayNftMedia;
  }

  async setDisplayNftMedia(enabled: boolean): Promise<void> {
    await this.#update({ displayNftMedia: enabled });
  }

  nfts(networkId: string): readonly { contract: string; tokenId: string }[] {
    return this.#settings.customNfts[networkId] ?? [];
  }

  async addNft(networkId: string, contract: string, tokenId: string): Promise<void> {
    const existing = this.nfts(networkId);
    if (existing.some((nft) => sameNft(nft, contract, tokenId))) return;
    await this.#update({
      customNfts: {
        ...this.#settings.customNfts,
        [networkId]: [...existing, { contract, tokenId }],
      },
    });
  }

  async removeNft(networkId: string, contract: string, tokenId: string): Promise<void> {
    await this.#update({
      customNfts: {
        ...this.#settings.customNfts,
        [networkId]: this.nfts(networkId).filter((nft) => !sameNft(nft, contract, tokenId)),
      },
    });
  }

  async setPaymaster(id: string, url: string): Promise<void> {
    await this.#update({ customPaymaster: { ...this.#settings.customPaymaster, [id]: url } });
  }

  async resetPaymaster(id: string): Promise<void> {
    await this.#update({ customPaymaster: omitKey(this.#settings.customPaymaster, id) });
  }

  async setRpc(id: string, rpcUrl: string): Promise<void> {
    await this.#update({ customRpc: { ...this.#settings.customRpc, [id]: rpcUrl } });
  }

  async resetRpc(id: string): Promise<void> {
    await this.#update({ customRpc: omitKey(this.#settings.customRpc, id) });
  }

  async #update(patch: Partial<Settings>): Promise<void> {
    this.#settings = { ...this.#settings, ...patch };
    await this.storage.save(this.#settings);
  }
}
