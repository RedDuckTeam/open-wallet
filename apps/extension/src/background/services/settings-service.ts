import {
  buildEvmNetwork,
  coinIdOf,
  DEFAULT_NETWORK_ID,
  NETWORKS,
  withRpcEndpoint,
  type CustomEvmNetworkInput,
  type NetworkConfig,
} from "../../config/networks.js";
import { hdAccountId, parseAccountId } from "../account-id.js";
import { AccountType } from "../../messaging/protocol.js";
import type { Settings, SettingsStorage, TokenConfig } from "../../platform/settings-storage.js";

const DEFAULTS: Settings = {
  activeNetworkId: DEFAULT_NETWORK_ID,
  activeAccountId: hdAccountId(0),
  accountCount: 1,
  hiddenAccountIds: [],
  customTokens: {},
  customRpc: {},
  customNetworks: [],
};

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
    };
    if (this.#settings.activeNetworkId === id) patch.activeNetworkId = DEFAULT_NETWORK_ID;
    await this.#update(patch);
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
