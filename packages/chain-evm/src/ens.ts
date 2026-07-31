import type { Address, PublicClient } from "viem";
import { getEnsAddress, getEnsName, normalize } from "viem/ens";

/**
 * Resolves an ENS name (e.g. "vitalik.eth") to the address it currently
 * points to, or `null` if it has none set. Normalizes `name` per ENSIP-15
 * first — the same UTS-46 normalization every ENS-aware wallet applies
 * before a lookup, so differently-cased or visually-confusable input
 * resolves the same way it would anywhere else.
 */
export async function resolveEnsAddress(
  client: PublicClient,
  name: string,
): Promise<Address | null> {
  return getEnsAddress(client, { name: normalize(name) });
}

/** Reverse-resolves an address to its primary ENS name, or `null` if it has none set. */
export async function lookupEnsName(
  client: PublicClient,
  address: Address,
): Promise<string | null> {
  return getEnsName(client, { address });
}
