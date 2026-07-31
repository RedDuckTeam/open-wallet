import { address as bitcoinAddress, networks, type Network } from "bitcoinjs-lib";
import type { AddressValidator } from "@openwallet/core";

/**
 * Whether `address` is a syntactically valid Bitcoin address for `network` —
 * any standard type (legacy p2pkh, p2sh, native SegWit, taproot), not just
 * the p2wpkh addresses this package derives. A wallet has to be able to
 * *send* to any address type even though it only ever *receives* on one.
 * The extra optional `network` parameter is assignable to `AddressValidator`
 * (a function with fewer required params satisfies a type expecting more) —
 * `satisfies` checks that without widening the export's own type down to
 * `AddressValidator`, which would erase `network` for this package's callers.
 */
export const isValidAddress = ((address: string, network: Network = networks.bitcoin): boolean => {
  try {
    bitcoinAddress.toOutputScript(address, network);
    return true;
  } catch {
    return false;
  }
}) satisfies AddressValidator;
