import { describe, expect, it } from "vitest";
import {
  parsePersonalSign,
  parseTypedData,
} from "../../apps/extension/src/background/dapp/dapp-params.js";

const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function typedData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    domain: { name: "Test", version: "1", chainId: 1 },
    types: { Permit: [{ name: "value", type: "uint256" }] },
    primaryType: "Permit",
    message: { value: 1 },
    ...overrides,
  };
}

describe("parsePersonalSign", () => {
  it("reads the spec order: message first, address second", () => {
    const { messageHex, address } = parsePersonalSign(["0xdeadbeef", ADDRESS]);

    expect(address).toBe(ADDRESS);
    expect(messageHex).toBe("0xdeadbeef");
  });

  it("hex-encodes a plain-text message", () => {
    expect(parsePersonalSign(["hi", ADDRESS]).messageHex).toBe("0x6869");
  });

  it("does not mistake a message that looks like an address for the address", () => {
    // The old heuristic picked "whichever argument parses as an address",
    // which swapped the two here — the approval screen would then show the
    // account as the message and sign the wrong bytes.
    const { messageHex, address } = parsePersonalSign([OTHER, ADDRESS]);

    expect(address).toBe(ADDRESS);
    expect(messageHex).toBe(OTHER);
  });

  it("still accepts the reversed order older dApps emit", () => {
    // Unambiguous only because the second argument is not an address.
    const { messageHex, address } = parsePersonalSign([ADDRESS, "0xdeadbeef"]);

    expect(address).toBe(ADDRESS);
    expect(messageHex).toBe("0xdeadbeef");
  });
});

describe("parseTypedData", () => {
  it("reads the domain chainId the caller must check against the active chain", () => {
    expect(parseTypedData([ADDRESS, typedData()]).chainId).toBe(1);
  });

  it("accepts a JSON-encoded document, as dApps commonly send", () => {
    const parsed = parseTypedData([ADDRESS, JSON.stringify(typedData())]);

    expect(parsed.address).toBe(ADDRESS);
    expect(parsed.chainId).toBe(1);
  });

  it("reads a hex or decimal string chainId, since it's a uint256", () => {
    expect(parseTypedData([ADDRESS, typedData({ domain: { chainId: "0x2105" } })]).chainId).toBe(
      8453,
    );
    expect(parseTypedData([ADDRESS, typedData({ domain: { chainId: "137" } })]).chainId).toBe(137);
  });

  it("reports no chainId when the domain omits one", () => {
    expect(parseTypedData([ADDRESS, typedData({ domain: { name: "Test" } })]).chainId).toBeNull();
  });

  it("rejects a document that isn't valid JSON", () => {
    expect(() => parseTypedData([ADDRESS, "{not json"])).toThrow();
  });

  it("rejects a document missing the pieces EIP-712 requires", () => {
    // Previously all of these were cast straight into TypedDataDefinition and
    // failed much later, deep inside viem, as an opaque encoding error.
    expect(() => parseTypedData([ADDRESS, typedData({ types: undefined })])).toThrow();
    expect(() => parseTypedData([ADDRESS, typedData({ message: undefined })])).toThrow();
    expect(() => parseTypedData([ADDRESS, typedData({ primaryType: "Missing" })])).toThrow();
    expect(() => parseTypedData([ADDRESS, typedData({ domain: "not an object" })])).toThrow();
    expect(() => parseTypedData([ADDRESS, 42])).toThrow();
  });
});
