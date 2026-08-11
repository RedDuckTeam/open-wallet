import { AccountType } from "../messaging/protocol.js";
import { parseAccountId } from "./account-id.js";
import type { SignWith } from "./chains.js";
import type { WalletService } from "./services/wallet-service.js";

export interface ActiveSigner {
  readonly address: string;
  /**
   * SEC1-compressed public key of the signing account. Carried alongside the
   * address because ERC-4337 needs it (viem's account type wants the
   * uncompressed form, which is derived from this) and the keyring already
   * has it — re-deriving it would mean touching the private key again for
   * something that isn't secret.
   */
  readonly publicKey: Uint8Array;
  readonly sign: SignWith;
  /**
   * The typed form of `sign`: runs `fn` with the private key and returns
   * its result unchanged. `sign` erases the return type to `unknown` because
   * its callers pass it across the chain-agnostic adapter boundary, where
   * the signed value's type is erased anyway; code that stays inside one
   * chain's types (the smart-account path) shouldn't have to widen and
   * re-narrow for that.
   */
  withPrivateKey<T>(fn: (privateKey: Uint8Array) => T | Promise<T>): Promise<T>;
}

// The single algorithm for "who signs for the active account on this coin":
// an imported key if the active ref is an import for this coin, otherwise the
// HD account at its index (or index 0 for a non-HD ref, e.g. an import on a
// different coin). Shared by the generic transfer path (any coin), the
// smart-account path, and the dApp signer (always ChainKind.Evm) so the
// fallback rule can't drift between them.
export function resolveActiveSigner(
  wallet: WalletService,
  activeAccountId: string,
  coinId: string,
): ActiveSigner {
  const ref = parseAccountId(activeAccountId);
  if (ref.type === AccountType.Imported && ref.coinId === coinId) {
    const account = wallet
      .importedAccounts(coinId)
      .find((imported) => imported.address === ref.address);
    if (!account) {
      throw new Error(`No imported account "${ref.address}" for coin "${coinId}"`);
    }
    const withPrivateKey = <T>(fn: (privateKey: Uint8Array) => T | Promise<T>): Promise<T> =>
      wallet.withImportedKey(coinId, ref.address, fn);
    return {
      address: account.address,
      publicKey: account.publicKey,
      sign: withPrivateKey,
      withPrivateKey,
    };
  }
  const index = ref.type === AccountType.Hd ? ref.index : 0;
  const account = wallet.account(coinId, index);
  const withPrivateKey = <T>(fn: (privateKey: Uint8Array) => T | Promise<T>): Promise<T> =>
    wallet.withKey(coinId, index, fn);
  return {
    address: account.address,
    publicKey: account.publicKey,
    sign: withPrivateKey,
    withPrivateKey,
  };
}
