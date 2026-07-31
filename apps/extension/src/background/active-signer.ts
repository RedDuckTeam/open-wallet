import { AccountType } from "../messaging/protocol.js";
import { parseAccountId } from "./account-id.js";
import type { SignWith } from "./chains.js";
import type { WalletService } from "./services/wallet-service.js";

export interface ActiveSigner {
  readonly address: string;
  readonly sign: SignWith;
}

// The single algorithm for "who signs for the active account on this coin":
// an imported key if the active ref is an import for this coin, otherwise the
// HD account at its index (or index 0 for a non-HD ref, e.g. an import on a
// different coin). Shared by the generic transfer path (any coin) and the
// dApp signer (always ChainKind.Evm) so the fallback rule can't drift between
// the two callers.
export function resolveActiveSigner(
  wallet: WalletService,
  activeAccountId: string,
  coinId: string,
): ActiveSigner {
  const ref = parseAccountId(activeAccountId);
  if (ref.type === AccountType.Imported && ref.coinId === coinId) {
    return {
      address: ref.address,
      sign: (fn) => wallet.withImportedKey(coinId, ref.address, fn),
    };
  }
  const index = ref.type === AccountType.Hd ? ref.index : 0;
  return {
    address: wallet.account(coinId, index).address,
    sign: (fn) => wallet.withKey(coinId, index, fn),
  };
}
