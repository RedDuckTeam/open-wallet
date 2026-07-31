import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import type { DerivedKey } from "./types.js";

/**
 * SLIP-0010 derivation for ed25519 (used by Solana). BIP-32 is defined only
 * for curves with a notion of public-key point addition; ed25519 doesn't
 * have one in the form BIP-32 needs, so SLIP-0010 restricts ed25519
 * derivation to hardened children only — there is no non-hardened case to
 * support, this isn't a simplification we chose.
 * https://github.com/satoshilabs/slips/blob/master/slip-0010.md
 */
const SEED_KEY = new TextEncoder().encode("ed25519 seed");
const HARDENED_OFFSET = 0x80000000;
/** Largest plain index whose hardened form (`HARDENED_OFFSET + index`) still fits in uint32. */
const MAX_INDEX = 0x7fffffff;
const DIGITS_ONLY = /^\d+$/;

interface Node {
  readonly key: Uint8Array;
  readonly chainCode: Uint8Array;
}

function masterNode(seed: Uint8Array): Node {
  const digest = hmac(sha512, SEED_KEY, seed);
  return { key: digest.slice(0, 32), chainCode: digest.slice(32, 64) };
}

function childNode(parent: Node, index: number): Node {
  const data = new Uint8Array(1 + 32 + 4);
  data.set(parent.key, 1); // data[0] stays 0x00, required by the hardened-derivation format
  new DataView(data.buffer).setUint32(33, index, false);
  const digest = hmac(sha512, parent.chainCode, data);
  return { key: digest.slice(0, 32), chainCode: digest.slice(32, 64) };
}

/** Parses "m/44'/501'/0'/0'" into hardened child indexes; every segment must be hardened (see module doc). */
function parsePath(path: string): number[] {
  return path
    .split("/")
    .filter((segment) => segment !== "m" && segment !== "")
    .map(parseHardenedSegment);
}

/**
 * `Number.parseInt` is lenient in ways that matter here — `"1.5"` silently
 * becomes `1`, `"abc"` silently becomes `NaN`, and `NaN + HARDENED_OFFSET`
 * silently becomes a *valid-looking* index once it round-trips through
 * `DataView.setUint32` (which coerces `NaN` to `0`). Every one of those
 * would derive a real, different key instead of failing — exactly the
 * class of bug this function exists to rule out. So: validate the digits
 * strictly before touching them, not just cast and hope.
 */
function parseHardenedSegment(segment: string): number {
  if (!segment.endsWith("'")) {
    throw new Error(
      `SLIP-0010 ed25519 requires every path segment to be hardened, got "${segment}"`,
    );
  }
  const digits = segment.slice(0, -1);
  if (!DIGITS_ONLY.test(digits)) {
    throw new Error(`Invalid path segment "${segment}": expected a non-negative integer index`);
  }
  const index = Number.parseInt(digits, 10);
  if (index > MAX_INDEX) {
    throw new Error(
      `Invalid path segment "${segment}": index must be at most ${String(MAX_INDEX)}`,
    );
  }
  return HARDENED_OFFSET + index;
}

export function deriveEd25519(seed: Uint8Array, path: string): DerivedKey {
  let node = masterNode(seed);
  for (const index of parsePath(path)) {
    node = childNode(node, index);
  }
  return { privateKey: node.key, publicKey: ed25519.getPublicKey(node.key) };
}
