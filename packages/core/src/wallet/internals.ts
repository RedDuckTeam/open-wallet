import type { Vault } from "../vault/vault.js";
import type { HdKeyring } from "../keyring/hd-keyring.js";
import type { ImportedKeyring } from "../keyring/imported-keyring.js";
import type { CoinEntry, ImportedAccount } from "../keyring/types.js";
import type { PublicAccount } from "./types.js";

/** One additional (non-primary) HD seed: its keyring plus the user-facing label. */
export interface AdditionalSeed {
  readonly keyring: HdKeyring;
  readonly name?: string;
}

/**
 * The narrow surface `Wallet` exposes to its manager collaborators
 * (`AccountManager`/`SeedManager`/`ImportedKeyManager`), so they can read and
 * mutate the state `Wallet` owns without inheriting from it or reaching for a
 * wider public API. `Wallet implements WalletInternals` and passes `this` to
 * each manager in its constructor. Deliberately **not** exported from the
 * package — it's an internal wiring detail, not part of the public surface.
 */
export interface WalletInternals {
  readonly isUnlocked: boolean;

  requireVault(): Vault;
  requireUnlocked(): HdKeyring;
  requireCoin(coinId: string): CoinEntry;
  requireImportedKeyring(coinId: string, address: string): ImportedKeyring;

  /** The single transactional primitive: `requireVault → mutate → storage.save`. */
  commit(mutator: (vault: Vault) => Promise<Vault>): Promise<void>;

  /** Push the auto-lock deadline out, but only while unlocked (vault-mutating ops). */
  noteActivityIfUnlocked(): void;
  /** Push the auto-lock deadline out unconditionally (account reads/imported-key access). */
  activity(): void;

  resolveKeyring(seedId?: string): HdKeyring;
  toPublicAccount(account: ImportedAccount): PublicAccount;

  // Additional-seed cache (the single copy lives on `Wallet`).
  setAdditionalSeed(id: string, seed: AdditionalSeed): void;
  getAdditionalSeed(seedId: string): AdditionalSeed | undefined;
  deleteAdditionalSeed(seedId: string): void;
  listAdditionalSeeds(): [string, AdditionalSeed][];

  // Imported-keyring cache (the single copy lives on `Wallet`).
  setImportedKeyring(coinId: string, address: string, keyring: ImportedKeyring): void;
  getImportedKeyring(coinId: string, address: string): ImportedKeyring | undefined;
  deleteImportedKeyring(coinId: string, address: string): void;
  listImportedKeyrings(): ImportedKeyring[];
}
