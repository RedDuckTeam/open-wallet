import type { KdfParams } from "../crypto/types.js";
import type { VAULT_VERSION } from "./constants.js";

/** One raw private key imported directly (not derived from the mnemonic). `address` lets callers look one up without holding onto the key itself. */
export interface ImportedKeyRecord {
  readonly coinId: string;
  readonly address: string;
  readonly privateKey: string;
}

/**
 * An additional seed beyond the vault's primary mnemonic — for "multiple
 * wallets in one app" (MetaMask's multi-SRP model: several independent HD
 * keyrings in one password-protected vault). Deliberately separate from
 * `mnemonic`: the BIP-39 passphrase ("hidden wallet", see `Wallet.unlock`)
 * only ever applies to the primary seed. Combining a memorized passphrase
 * with N additional persisted seeds is real complexity with no clear demand
 * yet, so additional seeds are always derived plain (no passphrase).
 */
export interface SeedRecord {
  readonly id: string;
  readonly mnemonic: string;
  readonly name?: string;
}

export interface VaultSecrets {
  readonly mnemonic: string;
  readonly seeds: readonly SeedRecord[];
  readonly importedKeys: readonly ImportedKeyRecord[];
}

export interface SerializedVault {
  readonly version: typeof VAULT_VERSION;
  readonly kdf: KdfParams & { readonly algorithm: "scrypt"; readonly salt: string };
  readonly nonce: string;
  readonly ciphertext: string;
}

/**
 * Where the encrypted vault blob is persisted. Deliberately just three
 * methods so a platform adapter (chrome.storage, iOS Keychain, Android
 * Keystore, a file) is a few lines to write and easy to trust.
 */
export interface VaultStorage {
  load(): Promise<SerializedVault | null>;
  save(vault: SerializedVault): Promise<void>;
  clear(): Promise<void>;
}
