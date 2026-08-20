import { getAddress, isAddress, size, slice } from "viem";
import type { Address, Hex, PublicClient } from "viem";

/**
 * EIP-7702's delegation indicator: an account that has delegated carries
 * exactly `0xef0100 || address` as its code — 23 bytes, never more. The
 * `0xef` lead byte is reserved by EIP-3541 (contracts can't start with it),
 * which is what makes this pattern unambiguous rather than a heuristic.
 * https://eips.ethereum.org/EIPS/eip-7702
 */
export const DELEGATION_PREFIX = "0xef0100";

/** 3 prefix bytes + a 20-byte address. Code of any other length is not a delegation. */
const DELEGATION_CODE_SIZE = 23;
const PREFIX_SIZE = 3;

/**
 * The implementation an EIP-7702 delegation indicator points at, or `null`
 * if `code` isn't one.
 *
 * Pure and total on purpose: this is the one rule that decides whether an
 * EOA is currently "smart", so it's worth being able to test it against
 * every malformed shape (empty code, a real contract, a truncated
 * indicator) with no RPC in the way. Anything that isn't exactly the
 * 23-byte pattern is `null` — a contract that merely happens to begin with
 * those bytes can't exist, but a caller passing arbitrary code shouldn't
 * get a plausible-looking address out of it either.
 */
export function parseDelegation(code: Hex | undefined | null): Address | null {
  if (!code || code === "0x") return null;
  if (size(code) !== DELEGATION_CODE_SIZE) return null;
  if (slice(code, 0, PREFIX_SIZE) !== DELEGATION_PREFIX) return null;
  const address = slice(code, PREFIX_SIZE);
  return isAddress(address, { strict: false }) ? getAddress(address) : null;
}

/** Reads `address`'s code and returns the implementation it delegates to, or `null`. */
export async function getDelegation(
  client: PublicClient,
  address: Address,
): Promise<Address | null> {
  const code = await client.getCode({ address });
  return parseDelegation(code);
}

/**
 * Whether `address` currently delegates to `implementation`.
 *
 * Compared case-insensitively through `getAddress` rather than as raw
 * strings: the on-chain indicator carries no checksum, so a direct `===`
 * against a checksummed constant would report "not delegated" for an
 * account that plainly is.
 */
export async function isDelegatedTo(
  client: PublicClient,
  address: Address,
  implementation: Address,
): Promise<boolean> {
  const current = await getDelegation(client, address);
  return current !== null && current === getAddress(implementation);
}
