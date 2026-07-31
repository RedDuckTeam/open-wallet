import { Wallet, type PublicAccount, type WalletOptions } from "@openwallet/core";
import { WalletState } from "../../messaging/protocol.js";

// Wraps the core Wallet: key lifecycle and signing. Knows nothing about chains,
// RPC, or messaging.
export class WalletService {
  #wallet: Wallet | null = null;

  constructor(private readonly options: WalletOptions) {}

  get isUnlocked(): boolean {
    return this.#wallet?.isUnlocked ?? false;
  }

  async state(): Promise<WalletState> {
    if (this.#wallet?.isUnlocked) return WalletState.Unlocked;
    return (await Wallet.exists(this.options.storage)) ? WalletState.Locked : WalletState.NoVault;
  }

  async create(password: string): Promise<string> {
    const { wallet, mnemonic } = await Wallet.create(password, this.options);
    this.#wallet = wallet;
    return mnemonic;
  }

  async import(mnemonic: string, password: string): Promise<void> {
    this.#wallet = await Wallet.import(mnemonic, password, this.options);
  }

  async unlock(password: string): Promise<void> {
    this.#wallet ??= await Wallet.open(this.options);
    await this.#wallet.unlock(password);
  }

  lock(): void {
    this.#wallet?.lock();
  }

  async reset(): Promise<void> {
    await this.#wallet?.reset();
    this.#wallet = null;
  }

  async revealMnemonic(password: string): Promise<string> {
    this.#wallet ??= await Wallet.open(this.options);
    const bytes = await this.#wallet.revealMnemonic(password);
    try {
      return new TextDecoder().decode(bytes);
    } finally {
      bytes.fill(0);
    }
  }

  account(coinId: string, index: number): PublicAccount {
    return this.#require().accounts.get(coinId, index);
  }

  accounts(coinId: string, count: number): PublicAccount[] {
    return this.#require().accounts.list(coinId, count);
  }

  // Runs fn with the account's private key; the key is wiped when fn settles.
  withKey<T>(
    coinId: string,
    index: number,
    fn: (privateKey: Uint8Array) => T | Promise<T>,
  ): Promise<T> {
    return this.#require().accounts.withPrivateKey(coinId, index, fn);
  }

  // password re-encrypts the vault with the new key added.
  importPrivateKey(
    password: string,
    coinId: string,
    privateKeyHex: string,
  ): Promise<PublicAccount> {
    return this.#require().imported.import(password, coinId, privateKeyHex);
  }

  importedAccounts(coinId: string): PublicAccount[] {
    return this.#require().imported.list(coinId);
  }

  async removeImported(password: string, coinId: string, address: string): Promise<void> {
    await this.#require().imported.remove(password, coinId, address);
  }

  withImportedKey<T>(
    coinId: string,
    address: string,
    fn: (privateKey: Uint8Array) => T | Promise<T>,
  ): Promise<T> {
    return this.#require().imported.withPrivateKey(coinId, address, fn);
  }

  #require(): Wallet {
    if (!this.#wallet?.isUnlocked) {
      throw new Error("Wallet is locked");
    }
    return this.#wallet;
  }
}
