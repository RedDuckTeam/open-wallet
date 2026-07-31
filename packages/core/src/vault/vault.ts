import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils.js";
import { zero, utf8ToBytes, bytesToUtf8 } from "../crypto/bytes.js";
import { deriveKey } from "../crypto/kdf.js";
import { DEFAULT_KDF_PARAMS } from "../crypto/constants.js";
import { encrypt as sealPayload, decrypt as openPayload } from "../crypto/vault-crypto.js";
import { generateMnemonic } from "../crypto/mnemonic.js";
import type { ImportedKeyRecord, SeedRecord, VaultSecrets, SerializedVault } from "./types.js";
import { VAULT_VERSION } from "./constants.js";
import { VaultUnlockError } from "./errors.js";

const SALT_LENGTH = 16;

/**
 * Encrypted-at-rest container for a wallet's secrets: the BIP-39 mnemonic
 * plus any imported private keys. `Vault` only knows how to turn a
 * password into decrypted `VaultSecrets` (or fail loudly) — it doesn't know
 * what an `HdKeyring` or a `CoinEntry` is, and has no opinion on *where* the
 * serialized form is persisted. Both of those stay in `Wallet`, which is
 * the thing that actually understands chains and keyrings.
 */
export class Vault {
  private constructor(private readonly data: SerializedVault) {}

  /** Creates a new vault. If `mnemonic` isn't given, a fresh one is generated — the caller must show it to the user for backup exactly once. */
  static async create(
    password: string,
    mnemonic: string = generateMnemonic(),
  ): Promise<{ vault: Vault; mnemonic: string }> {
    const vault = await Vault.seal(password, { mnemonic, seeds: [], importedKeys: [] });
    return { vault, mnemonic };
  }

  static deserialize(data: SerializedVault): Vault {
    if (data.version !== VAULT_VERSION) {
      throw new Error(`Unsupported vault version: ${String(data.version)}`);
    }
    return new Vault(data);
  }

  serialize(): SerializedVault {
    return this.data;
  }

  /** Decrypts the vault. Rejects with `VaultUnlockError` on a wrong password or corrupted data. */
  async unlock(password: string): Promise<VaultSecrets> {
    return this.open(password);
  }

  /** Re-encrypts the same secrets under a new password, as a fresh vault with a fresh salt and nonce. Never mutates `this`. */
  async changePassword(oldPassword: string, newPassword: string): Promise<Vault> {
    const secrets = await this.open(oldPassword);
    return Vault.seal(newPassword, secrets);
  }

  /** Adds one imported private key, re-encrypted under the same password. Rejects if that (coinId, address) is already imported. */
  async addImportedKey(password: string, record: ImportedKeyRecord): Promise<Vault> {
    const secrets = await this.open(password);
    const alreadyImported = secrets.importedKeys.some(
      (key) => key.coinId === record.coinId && key.address === record.address,
    );
    if (alreadyImported) {
      throw new Error(`"${record.address}" is already imported for coin "${record.coinId}"`);
    }
    return Vault.seal(password, { ...secrets, importedKeys: [...secrets.importedKeys, record] });
  }

  /** Removes one imported private key, re-encrypted under the same password. A no-op if it isn't there. */
  async removeImportedKey(password: string, coinId: string, address: string): Promise<Vault> {
    const secrets = await this.open(password);
    return Vault.seal(password, {
      ...secrets,
      importedKeys: secrets.importedKeys.filter(
        (key) => !(key.coinId === coinId && key.address === address),
      ),
    });
  }

  /** Adds one additional seed, re-encrypted under the same password. Rejects if `record.id` is already used. */
  async addSeed(password: string, record: SeedRecord): Promise<Vault> {
    const secrets = await this.open(password);
    if (secrets.seeds.some((seed) => seed.id === record.id)) {
      throw new Error(`Seed id "${record.id}" already exists`);
    }
    return Vault.seal(password, { ...secrets, seeds: [...secrets.seeds, record] });
  }

  /** Removes one additional seed, re-encrypted under the same password. A no-op if it isn't there. The primary seed (`mnemonic`) can't be removed this way. */
  async removeSeed(password: string, seedId: string): Promise<Vault> {
    const secrets = await this.open(password);
    return Vault.seal(password, {
      ...secrets,
      seeds: secrets.seeds.filter((seed) => seed.id !== seedId),
    });
  }

  /**
   * Both a wrong password (GCM auth tag mismatch) and a corrupted-but-somehow-
   * authenticating payload (malformed JSON — practically unreachable given
   * AES-GCM's integrity guarantee, but not a case this should ever surface
   * as a raw `SyntaxError` instead of the one error type `unlock()` promises)
   * end up as the same `VaultUnlockError`.
   */
  private async open(password: string): Promise<VaultSecrets> {
    const { kdf, nonce, ciphertext } = this.data;
    const key = await deriveKey(password, hexToBytes(kdf.salt), kdf);
    let plaintext: Uint8Array | null = null;
    try {
      plaintext = openPayload(key, hexToBytes(nonce), hexToBytes(ciphertext));
      return JSON.parse(bytesToUtf8(plaintext)) as VaultSecrets;
    } catch {
      throw new VaultUnlockError();
    } finally {
      zero(key);
      if (plaintext) {
        zero(plaintext);
      }
    }
  }

  private static async seal(password: string, secrets: VaultSecrets): Promise<Vault> {
    const salt = randomBytes(SALT_LENGTH);
    const key = await deriveKey(password, salt);
    const { nonce, ciphertext } = sealPayload(key, utf8ToBytes(JSON.stringify(secrets)));
    zero(key);
    return new Vault({
      version: VAULT_VERSION,
      kdf: { algorithm: "scrypt", ...DEFAULT_KDF_PARAMS, salt: bytesToHex(salt) },
      nonce: bytesToHex(nonce),
      ciphertext: bytesToHex(ciphertext),
    });
  }
}
