import type { Address, PublicClient } from "viem";
import { ERC165_ABI } from "../abi.js";
import { ERC1155_INTERFACE_ID, ERC721_INTERFACE_ID, NftStandard } from "./types.js";

/**
 * Which non-fungible standard a contract implements, or `null` if it claims
 * neither.
 *
 * Asked through ERC-165 rather than probed by calling `ownerOf` and seeing
 * whether it reverts: a revert is ambiguous (wrong standard, non-existent
 * token, or a node hiccup all look alike), and treating an ERC-1155 as an
 * ERC-721 produces a transfer built with the wrong signature.
 *
 * A contract that answers neither — or that doesn't implement ERC-165 at all,
 * which makes the call itself revert — is reported as `null` rather than
 * guessed at. Some pre-ERC-165 collections exist; they're rare enough that
 * silently assuming ERC-721 for every unidentifiable contract would mislabel
 * more things than it rescues.
 */
export async function detectNftStandard(
  client: PublicClient,
  contract: Address,
): Promise<NftStandard | null> {
  const supports = async (interfaceId: string): Promise<boolean> => {
    try {
      return await client.readContract({
        address: contract,
        abi: ERC165_ABI,
        functionName: "supportsInterface",
        args: [interfaceId as `0x${string}`],
      });
    } catch {
      return false;
    }
  };

  // Checked in parallel: a contract implements at most one of these, so
  // there's no ordering to preserve and no reason to pay two round-trips.
  const [erc721, erc1155] = await Promise.all([
    supports(ERC721_INTERFACE_ID),
    supports(ERC1155_INTERFACE_ID),
  ]);
  if (erc721) return NftStandard.Erc721;
  if (erc1155) return NftStandard.Erc1155;
  return null;
}
