import { PublicKey } from "@solana/web3.js";
import type { AddressValidator } from "@openwallet/core";

/**
 * Whether `address` is a syntactically valid Solana address — any base58
 * 32-byte value, not just ones with a corresponding private key. Program
 * Derived Addresses are deliberately off-curve (no private key exists for
 * them) but are completely valid addresses to send to, so this
 * deliberately does not check `PublicKey.isOnCurve()`.
 */
export const isValidAddress: AddressValidator = (address) => {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
};
