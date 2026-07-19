import { isAddress } from "viem";
import type { AddressValidator } from "@openwallet/core";

/**
 * Whether `address` is a valid EVM address. Checksum-validated by default
 * (viem's own `strict: true` default) — catching a wrong-case address
 * (a single flipped character in the checksum) is exactly the kind of typo
 * a "paste an address" field should refuse rather than silently accept.
 */
export const isValidAddress: AddressValidator = (address) => {
  return isAddress(address);
};
