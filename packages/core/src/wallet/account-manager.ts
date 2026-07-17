import type { Account } from "../keyring/types.js";
import { zero } from "../crypto/bytes.js";
import type { PublicAccount, SeedScope, WalletAccounts } from "./types.js";
import type { WalletInternals } from "./internals.js";

/**
 * HD accounts, identified by `(coinId, accountIndex)` and derived on demand
 * from a seed. Reached through `wallet.accounts`. Private keys never leave a
 * `withPrivateKey` callback scope; `get`/`list` derive a key internally only
 * to read its public half, then wipe it immediately — they never return it.
 */
export class AccountManager implements WalletAccounts {
  constructor(private readonly internals: WalletInternals) {}

  /**
   * The account's address and public key — never its private key. Pass
   * `{ seedId }` to select an additional seed (see `wallet.seeds`); omit it
   * for the primary seed.
   */
  get(coinId: string, accountIndex = 0, scope?: SeedScope): PublicAccount {
    const { privateKey, ...publicAccount } = this.deriveAccount(
      coinId,
      accountIndex,
      scope?.seedId,
    );
    zero(privateKey);
    return publicAccount;
  }

  list(coinId: string, count: number, scope?: SeedScope): PublicAccount[] {
    return Array.from({ length: count }, (_, accountIndex) =>
      this.get(coinId, accountIndex, scope),
    );
  }

  /**
   * The only way to touch an HD account's private key: it's derived, handed
   * to `fn`, and zeroed as soon as `fn` settles — it never exists outside
   * this call. Pass this straight to a chain package's
   * `signTransaction`/`signMessage`. `scope` works the same as on `get` —
   * trailing and optional, so it's a separate parameter from `fn` rather than
   * folded into a 4th bare positional argument that would sit unnoticed after
   * a (possibly multi-line) callback body.
   */
  async withPrivateKey<T>(
    coinId: string,
    accountIndex: number,
    fn: (privateKey: Uint8Array) => T | Promise<T>,
    scope?: SeedScope,
  ): Promise<T> {
    const account = this.deriveAccount(coinId, accountIndex, scope?.seedId);
    try {
      return await fn(account.privateKey);
    } finally {
      zero(account.privateKey);
    }
  }

  private deriveAccount(coinId: string, accountIndex: number, seedId?: string): Account {
    const keyring = this.internals.resolveKeyring(seedId);
    this.internals.activity();
    const coin = this.internals.requireCoin(coinId);
    return keyring.deriveAccount(coin, accountIndex);
  }
}
