import type { Address, PublicClient } from "viem";
import { ERC1155_ABI, ERC721_ABI } from "../abi.js";
import { NftStandard, type NftAttribute, type NftMetadata } from "./types.js";

/**
 * Default IPFS gateway. Configurable per call because the choice is a privacy
 * and availability tradeoff a wallet shouldn't make silently for its users:
 * every gateway request tells that gateway which NFTs an IP address is
 * looking at.
 */
export const DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/";

const EMPTY_METADATA: NftMetadata = {
  name: null,
  description: null,
  imageUrl: null,
  attributes: [],
};

/**
 * Rewrites the URI schemes NFT metadata actually uses into something a
 * browser can fetch.
 *
 * `ipfs://` is the common case, in two shapes — `ipfs://<cid>/path` and the
 * older `ipfs://ipfs/<cid>` — which must collapse to the same gateway URL.
 * `ar://` (Arweave) gets the same treatment. Anything already http(s) or a
 * `data:` URI passes through untouched.
 */
export function resolveUri(uri: string, gateway: string = DEFAULT_IPFS_GATEWAY): string {
  const trimmed = uri.trim();
  if (trimmed.startsWith("ipfs://")) {
    const path = trimmed.slice("ipfs://".length).replace(/^ipfs\//, "");
    return `${gateway}${path}`;
  }
  if (trimmed.startsWith("ar://")) {
    return `https://arweave.net/${trimmed.slice("ar://".length)}`;
  }
  return trimmed;
}

/**
 * ERC-1155 defines one `uri(uint256)` template shared by every id, with the
 * literal `{id}` replaced by the id as **64 lowercase hex digits, zero
 * padded, without a 0x prefix** — a detail from the spec that's easy to get
 * wrong and produces a 404 rather than an error when you do.
 *
 * ERC-721's `tokenURI` has no such placeholder, but substituting is harmless
 * there, so this is applied uniformly.
 */
export function applyTokenIdTemplate(uri: string, tokenId: bigint): string {
  return uri.replaceAll("{id}", tokenId.toString(16).padStart(64, "0"));
}

/** The metadata URI a contract reports for one token, already templated and scheme-resolved. */
export async function getTokenUri(
  client: PublicClient,
  standard: NftStandard,
  contract: Address,
  tokenId: bigint,
  gateway?: string,
): Promise<string | null> {
  try {
    const uri =
      standard === NftStandard.Erc721
        ? await client.readContract({
            address: contract,
            abi: ERC721_ABI,
            functionName: "tokenURI",
            args: [tokenId],
          })
        : await client.readContract({
            address: contract,
            abi: ERC1155_ABI,
            functionName: "uri",
            args: [tokenId],
          });
    if (!uri) return null;
    return resolveUri(applyTokenIdTemplate(uri, tokenId), gateway);
  } catch {
    // A token with no metadata URI is a normal state (burned, not yet
    // revealed, a contract that simply doesn't implement it) — not an error
    // worth failing a whole collection listing over.
    return null;
  }
}

/**
 * Parses an NFT metadata document defensively.
 *
 * Every field is optional and every type is checked, because this JSON is
 * arbitrary third-party content: a wallet that assumes `attributes` is an
 * array of objects with string values crashes its own NFT list the first time
 * a collection ships a number, a null, or a nested object there.
 */
export function parseNftMetadata(raw: unknown, gateway?: string): NftMetadata {
  if (typeof raw !== "object" || raw === null) return EMPTY_METADATA;
  const doc = raw as Record<string, unknown>;
  const image = firstString(doc.image, doc.image_url, doc.imageUrl, doc.animation_url) ?? null;
  return {
    name: firstString(doc.name) ?? null,
    description: firstString(doc.description) ?? null,
    imageUrl: image === null ? null : resolveUri(image, gateway),
    attributes: parseAttributes(doc.attributes),
  };
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

/**
 * `attributes` is conventionally `[{ trait_type, value }]`, but `value` is
 * routinely a number or a boolean, and some collections use `trait` instead
 * of `trait_type`. Entries that carry neither a usable label nor a
 * displayable value are dropped rather than rendered as "undefined".
 */
function parseAttributes(raw: unknown): NftAttribute[] {
  if (!Array.isArray(raw)) return [];
  const attributes: NftAttribute[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const trait = firstString(item.trait_type, item.trait, item.key);
    const value = item.value;
    if (trait === undefined) continue;
    if (typeof value === "string" && value.length > 0) {
      attributes.push({ trait, value });
    } else if (typeof value === "number" || typeof value === "boolean") {
      attributes.push({ trait, value: String(value) });
    }
  }
  return attributes;
}
