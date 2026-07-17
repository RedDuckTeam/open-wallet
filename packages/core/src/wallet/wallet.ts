import { hexToBytes } from "@noble/hashes/utils.js";
import type { CoinEntry, ImportedAccount } from "../keyring/types.js";
import { HdKeyring } from "../keyring/hd-keyring.js";
import { ImportedKeyring } from "../keyring/imported-keyring.js";
import { LockTimer } from "./lock-timer.js";
import type { VaultStorage } from "../vault/types.js";
import { utf8ToBytes } from "../crypto/bytes.js";
import { Vault } from "../vault/vault.js";
import { validateMnemonic } from "../crypto/mnemonic.js";
import type {
  WalletOptions,
  PublicAccount,
  WalletAccounts,
  WalletSeeds,
  WalletImportedAccounts,
} from "./types.js";
import { IMPORTED_ACCOUNT_PATH } from "./constants.js";
import { AccountManager } from "./account-manager.js";
import { SeedManager } from "./seed-manager.js";
import { ImportedKeyManager, importedKeyId } from "./imported-key-manager.js";
import type { WalletInternals, AdditionalSeed } from "./internals.js";

/**
 * The top-level controller: owns the vault lifecycle, a registry of chains,
 * and auto-lock — the same job MetaMask's `KeyringController` does. It
 * stays chain-agnostic (no dependency on any `@openwallet/chain-*` package);
 * callers register whichever `CoinEntry`s they need.
 *
 * Its operations are grouped into three namespaced facades: `wallet.accounts`
 * (HD accounts), `wallet.seeds` (additional seeds), and `wallet.imported`
 * (imported raw keys). Lifecycle — `unlock`/`lock`/`changePassword`/
 * `revealMnemonic`/`reset` — stays on the wallet itself, since it spans all
 * three categories at once.
 *
 * Two kinds of accounts, addressed two different ways because they
 * genuinely work differently: HD accounts (`accounts.get`/
 * `accounts.withPrivateKey`) are identified by `(coinId, accountIndex)` and
 * derived on demand from the mnemonic; imported accounts (`imported.list`/
 * `imported.withPrivateKey`) are identified by `(coinId, address)` and hold a
 * fixed raw key. Forcing both through one index-based API would hide that
 * difference, not simplify it.
 *
 * A wallet also holds one *primary* seed plus any number of *additional*
 * seeds (`seeds.add`/`seeds.import`/`seeds.remove`/`seeds.list`) — independent
 * HD keyrings in the same password-protected vault, the same "multiple SRPs"
 * model MetaMask uses. HD-account methods take an optional trailing
 * `SeedScope` (`{ seedId }`), defaulting to the primary seed, so single-seed
 * callers are unaffected. Only the primary seed supports the BIP-39
 * passphrase (see `unlock()`) — additional seeds are always derived plain.
 *
 * Private keys never leave an `accounts.withPrivateKey`/
 * `imported.withPrivateKey` callback scope. `accounts.get` and
 * `accounts.list` derive a key internally only to read its public half, then
 * wipe it immediately — they never return it.
 */
export class Wallet implements WalletInternals {
  private readonly coins: ReadonlyMap<string, CoinEntry>;
  private readonly storage: VaultStorage;
  private readonly lockTimer: LockTimer;
  private vault: Vault | null = null;
  private keyring: HdKeyring | null = null;
  private additionalSeeds: ReadonlyMap<string, AdditionalSeed> = new Map();
  private importedKeyrings: ReadonlyMap<string, ImportedKeyring> = new Map();

  readonly #accounts: AccountManager;
  readonly #seeds: SeedManager;
  readonly #imported: ImportedKeyManager;

  constructor(options: WalletOptions) {
    const coins = new Map<string, CoinEntry>();
    for (const coin of options.coins) {
      if (coins.has(coin.id)) {
        throw new Error(`Duplicate coin id registered: "${coin.id}"`);
      }
      coins.set(coin.id, coin);
    }
    this.coins = coins;
    this.storage = options.storage;
    this.lockTimer = new LockTimer(() => this.lock(), options.autoLockMs);
    this.#accounts = new AccountManager(this);
    this.#seeds = new SeedManager(this);
    this.#imported = new ImportedKeyManager(this);
  }

  /** Whether `storage` already holds a vault — no password needed. For onboarding: show create/import if `false`, or an unlock screen if `true`. */
  static async exists(storage: VaultStorage): Promise<boolean> {
    return (await storage.load()) !== null;
  }

  /**
   * Generates a fresh mnemonic, persists an encrypted vault for it, and
   * returns it already unlocked. Fails if `storage` already holds a vault.
   * `passphrase` is the optional BIP-39 "25th word" — see `unlock()`.
   */
  static async create(
    password: string,
    options: WalletOptions,
    passphrase?: string,
  ): Promise<{ wallet: Wallet; mnemonic: string }> {
    await assertNoExistingVault(options.storage);
    const { vault, mnemonic } = await Vault.create(password);
    await options.storage.save(vault.serialize());
    const wallet = new Wallet(options);
    wallet.vault = vault;
    await wallet.unlock(password, passphrase);
    return { wallet, mnemonic };
  }

  /** Restores a wallet from an existing mnemonic (the "import wallet" flow), already unlocked. Fails if `storage` already holds a vault. */
  static async import(
    mnemonic: string,
    password: string,
    options: WalletOptions,
    passphrase?: string,
  ): Promise<Wallet> {
    // Checked *before* touching storage: `Vault.create` doesn't validate the
    // mnemonic it's given, so an invalid one would otherwise get persisted
    // successfully and only fail later, inside `unlock()` — leaving a vault
    // in storage that can never again be unlocked with any password.
    if (!validateMnemonic(mnemonic)) {
      throw new Error("Invalid mnemonic");
    }
    await assertNoExistingVault(options.storage);
    const { vault } = await Vault.create(password, mnemonic);
    await options.storage.save(vault.serialize());
    const wallet = new Wallet(options);
    wallet.vault = vault;
    await wallet.unlock(password, passphrase);
    return wallet;
  }

  /** Loads a previously created vault from storage, locked, ready for `unlock()`. */
  static async open(options: WalletOptions): Promise<Wallet> {
    const serialized = await options.storage.load();
    if (!serialized) {
      throw new Error("No vault found in storage — call Wallet.create() or Wallet.import() first");
    }
    const wallet = new Wallet(options);
    wallet.vault = Vault.deserialize(serialized);
    return wallet;
  }

  get isUnlocked(): boolean {
    return this.keyring !== null;
  }

  /** HD accounts, identified by `(coinId, accountIndex)` and derived from a seed. */
  get accounts(): WalletAccounts {
    return this.#accounts;
  }

  /** Additional (non-primary) HD seeds — independent keyrings in the same vault. */
  get seeds(): WalletSeeds {
    return this.#seeds;
  }

  /** Imported accounts, identified by `(coinId, address)` and holding a fixed raw key. */
  get imported(): WalletImportedAccounts {
    return this.#imported;
  }

  /**
   * `passphrase` is the optional BIP-39 "25th word". It is **never**
   * persisted anywhere — not in the vault, not on disk — which is the whole
   * point of it: it must be supplied fresh on every unlock, exactly like
   * Ledger/Trezor treat it, so that a mnemonic plus passphrase derives a
   * *different, otherwise-unrelated* set of accounts (a "hidden wallet")
   * that stays inaccessible even to someone who has the vault password.
   * Omitting it (or unlocking with a different passphrase later) is not an
   * error — it just unlocks into a different set of accounts, deterministically.
   */
  async unlock(password: string, passphrase?: string): Promise<void> {
    const vault = this.requireVault();
    const secrets = await vault.unlock(password);
    this.keyring = HdKeyring.fromMnemonic(secrets.mnemonic, passphrase);
    const additionalSeeds = new Map<string, AdditionalSeed>();
    for (const seed of secrets.seeds) {
      additionalSeeds.set(seed.id, {
        keyring: HdKeyring.fromMnemonic(seed.mnemonic),
        ...(seed.name !== undefined && { name: seed.name }),
      });
    }
    this.additionalSeeds = additionalSeeds;
    const importedKeyrings = new Map<string, ImportedKeyring>();
    for (const record of secrets.importedKeys) {
      const coin = this.coins.get(record.coinId);
      // A key imported for a chain this particular Wallet instance doesn't
      // register isn't an error — just nothing this session can use.
      if (!coin) continue;
      const keyring = ImportedKeyring.fromPrivateKey(coin, hexToBytes(record.privateKey));
      importedKeyrings.set(importedKeyId(record.coinId, keyring.account.address), keyring);
    }
    this.importedKeyrings = importedKeyrings;
    this.lockTimer.start();
  }

  lock(): void {
    this.keyring?.wipe();
    this.keyring = null;
    for (const { keyring } of this.additionalSeeds.values()) {
      keyring.wipe();
    }
    this.additionalSeeds = new Map();
    for (const keyring of this.importedKeyrings.values()) {
      keyring.wipe();
    }
    this.importedKeyrings = new Map();
    this.lockTimer.stop();
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await this.#commit((vault) => vault.changePassword(oldPassword, newPassword));
    this.noteActivityIfUnlocked();
  }

  /**
   * Decrypts and returns the mnemonic — the "view recovery phrase" flow
   * every wallet needs, since `create()`/`seeds.add()` only ever hand it out
   * once. Returns UTF-8 bytes rather than a `string` so the caller can
   * `zero()` them once the user is done viewing the phrase, same reason
   * every other secret in this package is a `Uint8Array`. Requires the
   * wallet's password — same friction as `changePassword` — and works
   * whether or not the wallet is currently unlocked. Pass `seedId` to reveal
   * an additional seed instead of the primary one.
   */
  async revealMnemonic(password: string, seedId?: string): Promise<Uint8Array> {
    const vault = this.requireVault();
    const secrets = await vault.unlock(password);
    this.noteActivityIfUnlocked();
    if (seedId === undefined) {
      return utf8ToBytes(secrets.mnemonic);
    }
    const seed = secrets.seeds.find((s) => s.id === seedId);
    if (!seed) {
      throw new Error(`Unknown seed id: "${seedId}"`);
    }
    return utf8ToBytes(seed.mnemonic);
  }

  /** Locks, forgets the vault, and clears storage — the "delete this wallet" flow. Irreversible without the mnemonic. */
  async reset(): Promise<void> {
    this.lock();
    this.vault = null;
    await this.storage.clear();
  }

  // ---- WalletInternals: the narrow surface the managers reach state through ----

  commit(mutator: (vault: Vault) => Promise<Vault>): Promise<void> {
    return this.#commit(mutator);
  }

  /**
   * The single transactional primitive shared by every vault-mutating path:
   * take the current vault, apply `mutator`, persist the result. Cache-sync
   * and `noteActivityIfUnlocked()` stay in each caller, because their order
   * relative to the save genuinely differs between operations.
   */
  async #commit(mutator: (vault: Vault) => Promise<Vault>): Promise<void> {
    const vault = this.requireVault();
    this.vault = await mutator(vault);
    await this.storage.save(this.vault.serialize());
  }

  activity(): void {
    this.lockTimer.activity();
  }

  /**
   * Vault-mutating methods (`imported.import`, `revealMnemonic`, `seeds.add`,
   * ...) work whether or not the wallet is unlocked, so they can't
   * unconditionally call `lockTimer.activity()` the way account reads do —
   * starting the auto-lock timer while nothing is unlocked would schedule a
   * pointless `lock()` call. But when the wallet *is* unlocked, these are just
   * as much "activity" as reading an account, so they should push the deadline
   * back out the same way.
   */
  noteActivityIfUnlocked(): void {
    if (this.isUnlocked) {
      this.lockTimer.activity();
    }
  }

  toPublicAccount(account: ImportedAccount): PublicAccount {
    return {
      coinId: account.coinId,
      address: account.address,
      publicKey: account.publicKey,
      path: IMPORTED_ACCOUNT_PATH,
    };
  }

  /** Resolves which HD keyring to derive from: the primary seed, or one named additional seed. */
  resolveKeyring(seedId?: string): HdKeyring {
    const primary = this.requireUnlocked();
    if (seedId === undefined) {
      return primary;
    }
    const seed = this.getAdditionalSeed(seedId);
    if (!seed) {
      throw new Error(`Unknown seed id: "${seedId}"`);
    }
    return seed.keyring;
  }

  setAdditionalSeed(id: string, seed: AdditionalSeed): void {
    this.additionalSeeds = new Map(this.additionalSeeds).set(id, seed);
  }

  getAdditionalSeed(seedId: string): AdditionalSeed | undefined {
    return this.additionalSeeds.get(seedId);
  }

  deleteAdditionalSeed(seedId: string): void {
    const remaining = new Map(this.additionalSeeds);
    remaining.get(seedId)?.keyring.wipe();
    remaining.delete(seedId);
    this.additionalSeeds = remaining;
  }

  listAdditionalSeeds(): [string, AdditionalSeed][] {
    return [...this.additionalSeeds.entries()];
  }

  setImportedKeyring(coinId: string, address: string, keyring: ImportedKeyring): void {
    this.importedKeyrings = new Map(this.importedKeyrings).set(
      importedKeyId(coinId, address),
      keyring,
    );
  }

  getImportedKeyring(coinId: string, address: string): ImportedKeyring | undefined {
    return this.importedKeyrings.get(importedKeyId(coinId, address));
  }

  deleteImportedKeyring(coinId: string, address: string): void {
    const key = importedKeyId(coinId, address);
    const remaining = new Map(this.importedKeyrings);
    remaining.get(key)?.wipe();
    remaining.delete(key);
    this.importedKeyrings = remaining;
  }

  listImportedKeyrings(): ImportedKeyring[] {
    return [...this.importedKeyrings.values()];
  }

  requireVault(): Vault {
    if (!this.vault) {
      throw new Error(
        "No vault loaded — call Wallet.create(), Wallet.import(), or Wallet.open() first",
      );
    }
    return this.vault;
  }

  requireUnlocked(): HdKeyring {
    if (!this.keyring) {
      throw new Error("Wallet is locked");
    }
    return this.keyring;
  }

  requireImportedKeyring(coinId: string, address: string): ImportedKeyring {
    this.requireUnlocked();
    const keyring = this.getImportedKeyring(coinId, address);
    if (!keyring) {
      throw new Error(`No imported account "${address}" for coin "${coinId}"`);
    }
    return keyring;
  }

  requireCoin(coinId: string): CoinEntry {
    const coin = this.coins.get(coinId);
    if (!coin) {
      throw new Error(`Unregistered coin: "${coinId}"`);
    }
    return coin;
  }
}

async function assertNoExistingVault(storage: VaultStorage): Promise<void> {
  if (await Wallet.exists(storage)) {
    throw new Error(
      "A wallet already exists in this storage; call reset() before creating or importing another",
    );
  }
}
