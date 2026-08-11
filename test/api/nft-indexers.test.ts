import { describe, expect, it } from "vitest";
import { toNftInfo as alchemyToNftInfo } from "../../apps/api/src/nfts/alchemy.js";
import { toNftInfo as blockscoutToNftInfo } from "../../apps/api/src/nfts/blockscout.js";

const CONTRACT = "0x0000000000696760E15f265e828DB644A0c242EB";
// A real uint256 id, far past Number.MAX_SAFE_INTEGER — it must survive as a
// string end to end, because a rounded id addresses a different token.
const BIG_ID = "34454361969670104802583458346517400542074712368450903800518897101070583190115";

describe("alchemy mapping", () => {
  it("flattens an owned NFT into the shared contract shape", () => {
    expect(
      alchemyToNftInfo(1, {
        contract: { address: CONTRACT, name: "Wei Name Service" },
        tokenId: BIG_ID,
        tokenType: "ERC721",
        name: "vitalik.wei",
        description: "a name",
        image: { cachedUrl: "https://cdn/i.png", originalUrl: "ipfs://x" },
        balance: "1",
      }),
    ).toEqual([
      {
        chainId: 1,
        contract: CONTRACT.toLowerCase(),
        tokenId: BIG_ID,
        standard: "erc721",
        name: "vitalik.wei",
        collection: "Wei Name Service",
        description: "a name",
        imageUrl: "https://cdn/i.png",
        balance: "1",
      },
    ]);
  });

  it("recognises ERC-1155 and keeps its real balance", () => {
    const [nft] = alchemyToNftInfo(1, {
      contract: { address: CONTRACT },
      tokenId: "7",
      tokenType: "ERC1155",
      balance: "5",
    });

    expect(nft).toMatchObject({ standard: "erc1155", balance: "5" });
  });

  it("drops a record with no contract or id rather than failing the page", () => {
    expect(alchemyToNftInfo(1, { tokenId: "1" })).toEqual([]);
    expect(alchemyToNftInfo(1, { contract: { address: CONTRACT } })).toEqual([]);
  });

  it("defaults a missing balance to one, as ERC-721 has no balance field", () => {
    expect(alchemyToNftInfo(1, { contract: { address: CONTRACT }, tokenId: "1" })[0]?.balance).toBe(
      "1",
    );
  });
});

describe("blockscout mapping", () => {
  it("flattens the shape the live API actually returns", () => {
    expect(
      blockscoutToNftInfo(1, {
        id: BIG_ID,
        value: "1",
        token_type: "ERC-721",
        image_url: "https://blockscout/i.png",
        token: { address_hash: CONTRACT, name: "Wei Name Service" },
        metadata: { name: "vitalik.wei", description: "a name", image: "ipfs://x" },
      }),
    ).toEqual([
      {
        chainId: 1,
        contract: CONTRACT.toLowerCase(),
        tokenId: BIG_ID,
        standard: "erc721",
        name: "vitalik.wei",
        collection: "Wei Name Service",
        description: "a name",
        imageUrl: "https://blockscout/i.png",
        balance: "1",
      },
    ]);
  });

  it("maps Blockscout's hyphenated ERC-1155 label", () => {
    // Alchemy says "ERC1155", Blockscout says "ERC-1155"; getting this wrong
    // builds transfers with the wrong signature.
    const [nft] = blockscoutToNftInfo(1, {
      id: "7",
      value: "3",
      token_type: "ERC-1155",
      token: { address_hash: CONTRACT },
    });

    expect(nft).toMatchObject({ standard: "erc1155", balance: "3" });
  });

  it("falls back to raw metadata image when the indexer has no resolved URL", () => {
    const [nft] = blockscoutToNftInfo(1, {
      id: "1",
      token: { address_hash: CONTRACT },
      metadata: { image: "ipfs://raw" },
    });

    // Still an ipfs:// URI here; the extension resolves it to a gateway.
    expect(nft?.imageUrl).toBe("ipfs://raw");
  });

  it("ignores metadata fields that aren't strings", () => {
    const [nft] = blockscoutToNftInfo(1, {
      id: "1",
      token: { address_hash: CONTRACT },
      metadata: { name: 42, description: null, image: { nested: true } },
    });

    expect(nft).toMatchObject({ name: null, description: null, imageUrl: null });
  });

  it("drops a record with no contract or id", () => {
    expect(blockscoutToNftInfo(1, { id: "1" })).toEqual([]);
    expect(blockscoutToNftInfo(1, { token: { address_hash: CONTRACT } })).toEqual([]);
  });
});
