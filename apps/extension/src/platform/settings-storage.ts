import { browser } from "wxt/browser";
import { CURRENT_SETTINGS_VERSION, migrateSettings } from "./settings-migrations.js";
import type { CustomEvmNetworkInput } from "../config/networks.js";

// A user-added ERC-20 token, persisted per network.
export interface TokenConfig {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
}

// Non-secret app state, separate from the encrypted vault (which core owns).
export interface Settings {
  activeNetworkId: string;
  activeAccountId: string;
  // How many HD accounts have been revealed (derived on demand from the seed).
  accountCount: number;
  hiddenAccountIds: string[];
  // networkId -> user-added tokens.
  customTokens: Record<string, TokenConfig[]>;
  // networkId -> custom RPC/indexer endpoint.
  customRpc: Record<string, string>;
  customNetworks: CustomEvmNetworkInput[];
}

const KEY = "openwallet.settings";

// Versioned persistence, so shape changes migrate instead of resetting.
export class SettingsStorage {
  async load(): Promise<Partial<Settings> | null> {
    const result = await browser.storage.local.get(KEY);
    const raw = result[KEY] as unknown;
    return raw === undefined || raw === null ? null : (migrateSettings(raw) as Partial<Settings>);
  }

  async save(settings: Settings): Promise<void> {
    await browser.storage.local.set({ [KEY]: { version: CURRENT_SETTINGS_VERSION, settings } });
  }
}
