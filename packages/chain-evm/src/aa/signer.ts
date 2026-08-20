import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "viem";
import { privateKeyToAccount, toAccount } from "viem/accounts";
import type { Address, Hex, PrivateKeyAccount } from "viem";

/**
 * The wallet's side of signing, as a capability rather than a secret: an
 * address, its public key, and a way to *borrow* the private key for the
 * duration of one callback.
 *
 * This exists because of a genuine impedance mismatch. `@openwallet/core`
 * guarantees that a private key never escapes the callback scope that
 * receives it (`Wallet.accounts.withPrivateKey` derives, runs, then zeroes);
 * viem's account-abstraction API, meanwhile, wants a long-lived
 * `PrivateKeyAccount` object it can call repeatedly across network
 * round-trips. Handing viem a raw key to hold would quietly retire that
 * guarantee for every ERC-4337 code path.
 *
 * So the port is the callback, and `toOwnerAccount` builds the object viem
 * wants on top of it — the key then materializes only for the microtask of
 * each individual signature, never across the RPC calls in between.
 */
export interface EvmSigner {
  readonly address: Address;
  /**
   * SEC1-compressed secp256k1 public key — the same shape
   * `PublicAccount.publicKey` carries, so a caller passes what the keyring
   * already gave it instead of re-deriving anything.
   */
  readonly publicKey: Uint8Array;
  /**
   * Runs `fn` with the private key and returns its result. The
   * implementation is expected to zero the key once `fn` settles; every
   * caller in this package treats the key as valid only inside `fn`.
   */
  withPrivateKey<T>(fn: (privateKey: Uint8Array) => T | Promise<T>): Promise<T>;
}

/**
 * Ethereum public keys cross this package's boundary SEC1-compressed (the
 * BIP-32 default, shared with Bitcoin), but viem's account type carries the
 * uncompressed form. Same decompression `coin.ts` does for address
 * derivation, for the same reason: keep the EVM-specific encoding here
 * rather than special-casing EVM inside core's derivation layer.
 */
function toUncompressedPublicKey(publicKey: Uint8Array): Hex {
  return bytesToHex(secp256k1.Point.fromBytes(publicKey).toBytes(false));
}

/**
 * Adapts an `EvmSigner` into the `PrivateKeyAccount` viem's smart-account
 * factories require.
 *
 * Every signing method routes back through `withPrivateKey`, so the
 * resulting object is a *capability handle*, not a key holder: it can be
 * kept alive for the whole lifetime of a smart-account session without any
 * secret being alive with it.
 *
 * The single cast is deliberate and load-bearing. `PrivateKeyAccount` is
 * `LocalAccount<"privateKey">` plus `publicKey` and `signAuthorization`,
 * and this object supplies all three honestly — viem never reads a raw key
 * off an account, it only calls these methods. Declaring the type without
 * the cast isn't possible because `toAccount` fixes `source` to `"custom"`.
 */
export function toOwnerAccount(signer: EvmSigner): PrivateKeyAccount {
  const withAccount = <T>(fn: (account: PrivateKeyAccount) => Promise<T>): Promise<T> =>
    signer.withPrivateKey((privateKey) => fn(privateKeyToAccount(bytesToHex(privateKey))));

  const account = toAccount({
    address: signer.address,
    sign: (parameters) => withAccount((inner) => inner.sign(parameters)),
    signMessage: (parameters) => withAccount((inner) => inner.signMessage(parameters)),
    signTransaction: (transaction, options) =>
      withAccount((inner) => inner.signTransaction(transaction, options)),
    signTypedData: (parameters) =>
      withAccount((inner) =>
        inner.signTypedData(parameters as Parameters<typeof inner.signTypedData>[0]),
      ),
  });

  return {
    ...account,
    publicKey: toUncompressedPublicKey(signer.publicKey),
    source: "privateKey",
    signAuthorization: (parameters) => withAccount((inner) => inner.signAuthorization(parameters)),
  } as PrivateKeyAccount;
}
