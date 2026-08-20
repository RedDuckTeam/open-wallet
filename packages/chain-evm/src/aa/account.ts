import {
  toCoinbaseSmartAccount,
  toSimple7702SmartAccount,
  toSoladySmartAccount,
} from "viem/account-abstraction";
import type { Address, Hex, PrivateKeyAccount, PublicClient } from "viem";
import type { SmartAccount } from "viem/account-abstraction";
import { SmartAccountKind } from "./types.js";

/**
 * eth-infinitism's `Simple7702Account`, the implementation an EOA delegates
 * to under EntryPoint 0.8. Pinned here rather than left to viem's default
 * so the address this package *reports* as the delegation target (see
 * `SmartAccountProvider.implementation`) and the address it actually
 * delegates to are the same constant — two independently-defaulted values
 * would drift silently the moment viem changes its own default, and the
 * symptom would be a wallet that shows "not a smart account" for an account
 * that is one.
 */
export const SIMPLE_7702_IMPLEMENTATION: Address = "0xe6Cae83BdE06E4c305530e199D7217f42808555B";

export interface CreateSmartAccountParams {
  readonly client: PublicClient;
  /** The owner EOA, as a capability handle — see `toOwnerAccount`. */
  readonly owner: PrivateKeyAccount;
}

/**
 * One smart-account implementation, behind a uniform factory.
 *
 * This is the seam that keeps ERC-4337 from hardcoding a single vendor's
 * account into the wallet, and it isn't speculative generality: EIP-6551
 * token-bound accounts are also "a smart account whose address is not the
 * signer's address", so the same interface is what a TBA plugs into later.
 *
 * `sharesOwnerAddress` is the property callers actually branch on. It's
 * declared here, next to the factory, because it's a fact about the
 * implementation rather than about a particular account: EIP-7702 keeps the
 * owner's address (nothing to migrate, one balance), counterfactual kinds
 * introduce a second address that holds its own funds.
 */
export interface SmartAccountProvider {
  readonly kind: SmartAccountKind;
  readonly sharesOwnerAddress: boolean;
  /**
   * The contract an owner EOA must delegate to for this provider, or `null`
   * for counterfactual kinds, which deploy through a factory instead of
   * delegating. Lets a caller read delegation status (`isDelegatedTo`)
   * without knowing which kind it's holding.
   */
  readonly implementation: Address | null;
  create(params: CreateSmartAccountParams): Promise<SmartAccount>;
}

/**
 * EIP-7702: the owner's own EOA gains smart-account behaviour, keeping its
 * address, balance and history. The default for this wallet — it's the
 * model MetaMask ships (opt-in "switch to smart account"), and the only one
 * that doesn't force a user to move funds to start batching.
 */
export function simple7702Provider(
  options: { readonly implementation?: Address } = {},
): SmartAccountProvider {
  const implementation = options.implementation ?? SIMPLE_7702_IMPLEMENTATION;
  return {
    kind: SmartAccountKind.Simple7702,
    sharesOwnerAddress: true,
    implementation,
    create({ client, owner }): Promise<SmartAccount> {
      return toSimple7702SmartAccount({ client, owner, implementation });
    },
  };
}

/**
 * Coinbase Smart Wallet — counterfactual, widely deployed, and the one kind
 * here that supports passkey owners alongside ECDSA. Only the ECDSA owner
 * is wired up: a passkey owner isn't derived from the wallet's seed, so it
 * would be an account this wallet can't recover from a recovery phrase.
 */
export function coinbaseProvider(
  options: { readonly version?: "1" | "1.1" } = {},
): SmartAccountProvider {
  const version = options.version ?? "1.1";
  return {
    kind: SmartAccountKind.Coinbase,
    sharesOwnerAddress: false,
    implementation: null,
    create({ client, owner }): Promise<SmartAccount> {
      return toCoinbaseSmartAccount({ client, owners: [owner], version });
    },
  };
}

/** Solady's minimal ERC-4337 account — counterfactual, and the cheapest of the three to execute. */
export function soladyProvider(
  options: { readonly factoryAddress?: Address; readonly salt?: Hex } = {},
): SmartAccountProvider {
  return {
    kind: SmartAccountKind.Solady,
    sharesOwnerAddress: false,
    implementation: null,
    create({ client, owner }): Promise<SmartAccount> {
      return toSoladySmartAccount({
        client,
        owner,
        ...(options.factoryAddress !== undefined && { factoryAddress: options.factoryAddress }),
        ...(options.salt !== undefined && { salt: options.salt }),
      });
    },
  };
}

/**
 * The provider for a kind, with that kind's defaults. A caller that needs
 * to override an implementation address, a factory or a salt should build
 * the provider directly instead — this is the "just give me the standard
 * one" path, used when a kind arrives as a persisted string from settings.
 */
export function smartAccountProvider(kind: SmartAccountKind): SmartAccountProvider {
  switch (kind) {
    case SmartAccountKind.Simple7702:
      return simple7702Provider();
    case SmartAccountKind.Coinbase:
      return coinbaseProvider();
    case SmartAccountKind.Solady:
      return soladyProvider();
  }
}
