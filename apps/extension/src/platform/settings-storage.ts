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
  // networkId -> custom ERC-4337 bundler endpoint, overriding the built-in one.
  // These URLs usually carry a provider API key. They live here, in plain
  // browser storage, and NOT in the encrypted vault on purpose: the vault is
  // for secrets that move funds, and a bundler key is a rate-limit credential
  // — putting it behind the password would mean the wallet couldn't read its
  // own endpoint while locked, without making anything safer.
  customBundler: Record<string, string>;
  // networkId -> custom ERC-7677 paymaster endpoint. Same reasoning as above.
  customPaymaster: Record<string, string>;
  // networkId -> NFTs the user added by hand. Kept even when an indexer is
  // configured: these are the ones the user explicitly asked to see, and an
  // indexer that drops one as spam shouldn't make it disappear.
  customNfts: Record<string, { contract: string; tokenId: string }[]>;
  // Whether to ask the backend indexer what this account owns. Off by default,
  // the same choice MetaMask makes for its own "Autodetect NFTs": enumeration
  // means sending the account's address to a third-party service, which is a
  // privacy decision the user should make rather than inherit.
  autodetectNfts: boolean;
  // Whether to load NFT images. Each one is a request to whatever host the
  // collection chose, so rendering media discloses the viewer's IP — and, to
  // a collection that serves per-token URLs, which token they hold. On by
  // default because a manually added NFT was explicitly asked for; the toggle
  // exists for anyone who doesn't want the requests at all.
  displayNftMedia: boolean;
  // Max swap slippage in percent (0.5 means 0.5%). Bounds live in
  // background/slippage.ts; stored raw and sanitized on read, so a blob from
  // another build degrades to the default instead of failing to load.
  slippagePct: number;
  // Testnet mode: the wallet shows only test networks and hides swaps.
  testnetMode: boolean;
  // Which smart-account implementation to use, as a SmartAccountKind value.
  // Stored as a plain string: it crosses into persistence, and a settings
  // blob written by a build that knew one more kind must not fail to load.
  smartAccountKind: string;
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
