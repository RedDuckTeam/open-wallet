import type { CoinEntry, Account } from "./types.js";
import { deriveSecp256k1 } from "../crypto/secp256k1.js";
import { deriveEd25519 } from "../crypto/slip10-ed25519.js";
import { mnemonicToSeed, validateMnemonic } from "../crypto/mnemonic.js";
import { zero } from "../crypto/bytes.js";

/**
 * A single BIP-39 seed, unlocked in memory, capable of deriving accounts for
 * any chain that provides a `CoinEntry`. Covers "derive many accounts across
 * chains from one seed" — see `ImportedKeyring` for "I already have a raw
 * key." A hardware-wallet keyring is a natural future extension of the same
 * shape (something that can produce `Account`s) but is out of scope until a
 * platform actually needs one.
 */
export class HdKeyring {
  #seed: Uint8Array | null;

  private constructor(seed: Uint8Array) {
    this.#seed = seed;
  }

  static fromMnemonic(mnemonic: string, passphrase = ""): HdKeyring {
    if (!validateMnemonic(mnemonic)) {
      throw new Error("Invalid mnemonic");
    }
    return new HdKeyring(mnemonicToSeed(mnemonic, passphrase));
  }

  deriveAccount(coin: CoinEntry, accountIndex = 0): Account {
    if (!Number.isInteger(accountIndex) || accountIndex < 0) {
      throw new Error(`accountIndex must be a non-negative integer, got ${String(accountIndex)}`);
    }
    const seed = this.requireSeed();
    const path = coin.derivationPath(accountIndex);
    const { publicKey, privateKey } =
      coin.curve === "secp256k1" ? deriveSecp256k1(seed, path) : deriveEd25519(seed, path);
    return { coinId: coin.id, path, address: coin.deriveAddress(publicKey), publicKey, privateKey };
  }

  /** Zeroes the in-memory seed. Call this on lock/timeout — the keyring is unusable afterwards. */
  wipe(): void {
    if (this.#seed) {
      zero(this.#seed);
      this.#seed = null;
    }
  }

  private requireSeed(): Uint8Array {
    if (!this.#seed) {
      throw new Error("Keyring is locked (wipe() was already called)");
    }
    return this.#seed;
  }
}
