import { describe, expect, it } from "vitest";
import {
  DEFAULT_IPFS_GATEWAY,
  applyTokenIdTemplate,
  parseNftMetadata,
  resolveUri,
} from "../../src/nft/metadata.js";

describe("resolveUri", () => {
  it("rewrites ipfs:// to the gateway", () => {
    expect(resolveUri("ipfs://QmHash/1.json")).toBe(`${DEFAULT_IPFS_GATEWAY}QmHash/1.json`);
  });

  it("collapses the older ipfs://ipfs/ form to the same URL", () => {
    // Both shapes are in the wild and address the same content; treating them
    // differently means the same NFT resolves two ways.
    expect(resolveUri("ipfs://ipfs/QmHash")).toBe(resolveUri("ipfs://QmHash"));
  });

  it("rewrites Arweave URIs", () => {
    expect(resolveUri("ar://abc123")).toBe("https://arweave.net/abc123");
  });

  it("leaves http and data URIs alone", () => {
    expect(resolveUri("https://example.com/1.json")).toBe("https://example.com/1.json");
    expect(resolveUri("data:application/json;base64,e30=")).toBe(
      "data:application/json;base64,e30=",
    );
  });

  it("honours a caller-chosen gateway, since the default leaks what you're viewing to it", () => {
    expect(resolveUri("ipfs://QmHash", "https://my.gateway/ipfs/")).toBe(
      "https://my.gateway/ipfs/QmHash",
    );
  });
});

describe("applyTokenIdTemplate", () => {
  it("substitutes {id} as 64 zero-padded lowercase hex digits, per ERC-1155", () => {
    expect(applyTokenIdTemplate("https://x/{id}.json", 1n)).toBe(
      `https://x/${"0".repeat(63)}1.json`,
    );
  });

  it("uses lowercase hex for large ids", () => {
    expect(applyTokenIdTemplate("{id}", 255n)).toBe(`${"0".repeat(62)}ff`);
  });

  it("leaves a URI without the placeholder untouched", () => {
    expect(applyTokenIdTemplate("https://x/1.json", 1n)).toBe("https://x/1.json");
  });
});

describe("parseNftMetadata", () => {
  it("reads the fields a wallet displays", () => {
    expect(
      parseNftMetadata({
        name: "Punk #1",
        description: "A punk",
        image: "ipfs://QmImage",
        attributes: [{ trait_type: "Hat", value: "Cap" }],
      }),
    ).toEqual({
      name: "Punk #1",
      description: "A punk",
      imageUrl: `${DEFAULT_IPFS_GATEWAY}QmImage`,
      attributes: [{ trait: "Hat", value: "Cap" }],
    });
  });

  it("accepts the image_url spelling collections also use", () => {
    expect(parseNftMetadata({ image_url: "https://x/i.png" }).imageUrl).toBe("https://x/i.png");
  });

  it("stringifies numeric and boolean attribute values instead of dropping them", () => {
    expect(
      parseNftMetadata({ attributes: [{ trait_type: "Level", value: 7 }] }).attributes,
    ).toEqual([{ trait: "Level", value: "7" }]);
  });

  it("drops attribute entries that would render as undefined", () => {
    // Third-party JSON: an entry with no label, or a value that's an object,
    // must not become a visible "undefined" row.
    expect(
      parseNftMetadata({
        attributes: [{ value: "orphan" }, { trait_type: "X", value: { nested: true } }, null, 5],
      }).attributes,
    ).toEqual([]);
  });

  it("survives metadata that isn't an object at all", () => {
    const empty = { name: null, description: null, imageUrl: null, attributes: [] };
    expect(parseNftMetadata(null)).toEqual(empty);
    expect(parseNftMetadata("not json")).toEqual(empty);
    expect(parseNftMetadata(42)).toEqual(empty);
  });

  it("survives attributes that aren't an array", () => {
    expect(parseNftMetadata({ attributes: { Hat: "Cap" } }).attributes).toEqual([]);
  });
});
