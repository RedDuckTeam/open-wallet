import type { Account, CoinEntry } from "../keyring/types.js";
import type { VaultStorage } from "../vault/types.js";

export type PublicAccount = Omit<Account, "privateKey">;

/** Public (non-secret) info about an additional seed — see `Wallet.seeds.list()`. */
export interface SeedInfo {
  readonly id: string;
  readonly name?: string;
}

/** Trailing options shared by every HD-account method — omit `seedId` to use the primary seed. */
export interface SeedScope {
  readonly seedId?: string;
}

export interface WalletOptions {
  /** Every chain this wallet can derive/import accounts for. */
  readonly coins: readonly CoinEntry[];
  readonly storage: VaultStorage;
  /** Inactivity timeout before auto-lock. Defaults to 15 minutes. */
  readonly autoLockMs?: number;
}

/**
 * HD accounts, identified by `(coinId, accountIndex)` and derived on demand
 * from a seed. Reached through `wallet.accounts`.
 */
export interface WalletAccounts {
  get(coinId: string, accountIndex?: number, scope?: SeedScope): PublicAccount;
  list(coinId: string, count: number, scope?: SeedScope): PublicAccount[];
  withPrivateKey<T>(
    coinId: string,
    accountIndex: number,
    fn: (privateKey: Uint8Array) => T | Promise<T>,
    scope?: SeedScope,
  ): Promise<T>;
}

/**
 * Additional (non-primary) HD seeds — independent keyrings in the same
 * vault. Reached through `wallet.seeds`.
 */
export interface WalletSeeds {
  add(password: string, name?: string): Promise<{ seedId: string; mnemonic: string }>;
  import(mnemonic: string, password: string, name?: string): Promise<string>;
  remove(password: string, seedId: string): Promise<void>;
  list(): SeedInfo[];
}

/**
 * Imported accounts, identified by `(coinId, address)` and holding a fixed raw
 * key. Reached through `wallet.imported`.
 */
export interface WalletImportedAccounts {
  import(password: string, coinId: string, privateKeyHex: string): Promise<PublicAccount>;
  remove(password: string, coinId: string, address: string): Promise<void>;
  list(coinId?: string): PublicAccount[];
  withPrivateKey<T>(
    coinId: string,
    address: string,
    fn: (privateKey: Uint8Array) => T | Promise<T>,
  ): Promise<T>;
}
