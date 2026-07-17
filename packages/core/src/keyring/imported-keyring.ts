import type { CoinEntry, ImportedAccount } from "./types.js";
import { derivePublicKey } from "../crypto/public-key.js";
import { zero } from "../crypto/bytes.js";

/**
 * A single raw private key, used as-is rather than derived from the
 * wallet's mnemonic — MetaMask's equivalent is its "Simple Keyring".
 * Fixed to exactly one chain and one account: `HdKeyring` covers "derive
 * many accounts across chains from one seed"; this covers "I already have
 * a key and want to use it here."
 */
export class ImportedKeyring {
  #privateKey: Uint8Array | null;
  readonly account: ImportedAccount;

  private constructor(account: ImportedAccount, privateKey: Uint8Array) {
    this.account = account;
    this.#privateKey = privateKey;
  }

  static fromPrivateKey(coin: CoinEntry, privateKey: Uint8Array): ImportedKeyring {
    const publicKey = derivePublicKey(coin.curve, privateKey);
    const account: ImportedAccount = {
      coinId: coin.id,
      address: coin.deriveAddress(publicKey),
      publicKey,
    };
    return new ImportedKeyring(account, privateKey.slice());
  }

  /** A fresh copy of the private key — the caller owns it and must zero it when done. */
  exportPrivateKey(): Uint8Array {
    return this.requirePrivateKey().slice();
  }

  wipe(): void {
    if (this.#privateKey) {
      zero(this.#privateKey);
      this.#privateKey = null;
    }
  }

  private requirePrivateKey(): Uint8Array {
    if (!this.#privateKey) {
      throw new Error("Imported keyring is wiped");
    }
    return this.#privateKey;
  }
}
