import { hexToBytes } from "@noble/hashes/utils.js";
import { ImportedKeyring } from "../keyring/imported-keyring.js";
import { zero } from "../crypto/bytes.js";
import type { ImportedKeyRecord } from "../vault/types.js";
import type { PublicAccount, WalletImportedAccounts } from "./types.js";
import type { WalletInternals } from "./internals.js";

/** The `importedKeyrings` map key for an imported account: `(coinId, address)`. */
export function importedKeyId(coinId: string, address: string): string {
  return `${coinId}:${address}`;
}

/**
 * Imported accounts, identified by `(coinId, address)` and holding a fixed raw
 * key rather than one derived from a seed. Reached through `wallet.imported`.
 * Private keys never leave a `withPrivateKey` callback scope.
 */
export class ImportedKeyManager implements WalletImportedAccounts {
  constructor(private readonly internals: WalletInternals) {}

  /**
   * Imports a raw private key (hex-encoded) as a new account for `coinId`.
   * Requires the wallet's password — same friction as `changePassword` —
   * since it mutates the encrypted vault; works whether or not the wallet is
   * currently unlocked, exactly like `changePassword` does.
   */
  async import(password: string, coinId: string, privateKeyHex: string): Promise<PublicAccount> {
    // `requireVault()` runs first — before `requireCoin` and building the
    // keyring — so the observable error order is preserved ("No vault loaded"
    // before "Unregistered coin"). `commit` re-reads the same vault below.
    this.internals.requireVault();
    const coin = this.internals.requireCoin(coinId);
    const privateKey = hexToBytes(privateKeyHex);
    const keyring = ImportedKeyring.fromPrivateKey(coin, privateKey);
    zero(privateKey);

    const record: ImportedKeyRecord = {
      coinId,
      address: keyring.account.address,
      privateKey: privateKeyHex,
    };
    await this.internals.commit((vault) => vault.addImportedKey(password, record));

    if (this.internals.isUnlocked) {
      this.internals.setImportedKeyring(coinId, keyring.account.address, keyring);
    } else {
      keyring.wipe();
    }
    this.internals.noteActivityIfUnlocked();
    return this.internals.toPublicAccount(keyring.account);
  }

  /** Removes a previously imported account. Requires the wallet's password. */
  async remove(password: string, coinId: string, address: string): Promise<void> {
    await this.internals.commit((vault) => vault.removeImportedKey(password, coinId, address));
    this.internals.noteActivityIfUnlocked();
    this.internals.deleteImportedKeyring(coinId, address);
  }

  list(coinId?: string): PublicAccount[] {
    return this.internals
      .listImportedKeyrings()
      .filter((keyring) => !coinId || keyring.account.coinId === coinId)
      .map((keyring) => this.internals.toPublicAccount(keyring.account));
  }

  /** The only way to touch an imported account's private key — same zero-on-exit discipline as `wallet.accounts.withPrivateKey`. */
  async withPrivateKey<T>(
    coinId: string,
    address: string,
    fn: (privateKey: Uint8Array) => T | Promise<T>,
  ): Promise<T> {
    const keyring = this.internals.requireImportedKeyring(coinId, address);
    this.internals.activity();
    const privateKey = keyring.exportPrivateKey();
    try {
      return await fn(privateKey);
    } finally {
      zero(privateKey);
    }
  }
}
