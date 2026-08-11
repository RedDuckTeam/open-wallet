import { getAddress, type Address, type PublicClient } from "viem";
import { ERC1155_ABI, ERC721_ABI } from "../abi.js";
import { getTokenUri, parseNftMetadata } from "./metadata.js";
import { detectNftStandard } from "./standard.js";
import { NftStandard, type NftItem, type NftMetadata } from "./types.js";

/**
 * How many of a token an account holds: 1 or 0 for ERC-721 (derived from
 * `ownerOf`, which is the only ownership question that standard answers), the
 * real balance for ERC-1155.
 *
 * Unifying them is worth it because every caller above this line asks the
 * same question — "does this account still have it, and how many" — and the
 * two standards answer it with different calls.
 */
export async function getNftBalance(
  client: PublicClient,
  standard: NftStandard,
  contract: Address,
  tokenId: bigint,
  owner: Address,
): Promise<bigint> {
  if (standard === NftStandard.Erc1155) {
    return client.readContract({
      address: contract,
      abi: ERC1155_ABI,
      functionName: "balanceOf",
      args: [owner, tokenId],
    });
  }
  try {
    const current = await client.readContract({
      address: contract,
      abi: ERC721_ABI,
      functionName: "ownerOf",
      args: [tokenId],
    });
    return getAddress(current) === getAddress(owner) ? 1n : 0n;
  } catch {
    // `ownerOf` reverts for a burned or never-minted token, which is a real
    // answer to "do you hold it": no.
    return 0n;
  }
}

/** The ERC-721 owner of a token, or null when the token doesn't exist. */
export async function getNftOwner(
  client: PublicClient,
  contract: Address,
  tokenId: bigint,
): Promise<Address | null> {
  try {
    return await client.readContract({
      address: contract,
      abi: ERC721_ABI,
      functionName: "ownerOf",
      args: [tokenId],
    });
  } catch {
    return null;
  }
}

/** The collection name from the contract, or null for contracts that don't expose one (ERC-1155 has no required `name`). */
export async function getCollectionName(
  client: PublicClient,
  contract: Address,
): Promise<string | null> {
  try {
    return await client.readContract({
      address: contract,
      abi: ERC721_ABI,
      functionName: "name",
    });
  } catch {
    return null;
  }
}

/** Fetches and parses a token's off-chain metadata document. */
export async function fetchNftMetadata(
  metadataUrl: string | null,
  gateway?: string,
): Promise<NftMetadata> {
  const empty: NftMetadata = { name: null, description: null, imageUrl: null, attributes: [] };
  if (!metadataUrl) return empty;
  try {
    const response = await fetch(metadataUrl);
    if (!response.ok) return empty;
    return parseNftMetadata(await response.json(), gateway);
  } catch {
    // Unreachable gateway, CORS, malformed JSON — all of which are normal for
    // third-party metadata and none of which should break the caller.
    return empty;
  }
}

/**
 * Everything about one NFT an account holds, resolved from the chain plus its
 * metadata document. This is the path used when a user adds an NFT by
 * (contract, tokenId) by hand — enumeration of a whole wallet needs an
 * indexer, which is a platform concern, not something a node can answer.
 *
 * Returns `null` when the contract isn't a recognisable NFT contract, so the
 * caller can say "that's not an NFT" rather than showing an empty card.
 */
export async function readNft(
  client: PublicClient,
  contract: Address,
  tokenId: bigint,
  owner: Address,
  gateway?: string,
): Promise<NftItem | null> {
  const standard = await detectNftStandard(client, contract);
  if (standard === null) return null;

  const [balance, collection, metadataUrl] = await Promise.all([
    getNftBalance(client, standard, contract, tokenId, owner),
    getCollectionName(client, contract),
    getTokenUri(client, standard, contract, tokenId, gateway),
  ]);
  return {
    standard,
    contract,
    tokenId,
    collection,
    balance,
    metadata: await fetchNftMetadata(metadataUrl, gateway),
  };
}
