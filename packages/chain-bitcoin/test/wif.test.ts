import { networks } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";
import { privateKeyToWif, wifToPrivateKey } from "../src/wif.js";

// Private key = 1, compressed, computed independently via ecpair/bitcoinjs-lib
// directly (not recalled from memory) to serve as a real ground truth.
const PRIVATE_KEY_ONE = ((): Uint8Array => {
  const key = new Uint8Array(32);
  key[31] = 1;
  return key;
})();
const MAINNET_WIF = "KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn";
const TESTNET_WIF = "cMahea7zqjxrtgAbB7LSGbcQUr1uX1ojuat9jZodMN87JcbXMTcA";

describe("privateKeyToWif", () => {
  it("matches the known mainnet compressed WIF for private key 1", () => {
    expect(privateKeyToWif(PRIVATE_KEY_ONE)).toBe(MAINNET_WIF);
  });

  it("matches the known testnet compressed WIF for private key 1", () => {
    expect(privateKeyToWif(PRIVATE_KEY_ONE, networks.testnet)).toBe(TESTNET_WIF);
  });
});

describe("wifToPrivateKey", () => {
  it("decodes the known WIF back to the original private key", () => {
    expect(wifToPrivateKey(MAINNET_WIF)).toEqual(PRIVATE_KEY_ONE);
  });

  it("round-trips an arbitrary private key through encode -> decode", () => {
    const privateKey = new Uint8Array(32).fill(7);
    const wif = privateKeyToWif(privateKey);
    expect(wifToPrivateKey(wif)).toEqual(privateKey);
  });

  it("rejects a WIF encoded for a different network", () => {
    expect(() => wifToPrivateKey(MAINNET_WIF, networks.testnet)).toThrow();
  });

  it("rejects a malformed WIF string", () => {
    expect(() => wifToPrivateKey("not-a-valid-wif")).toThrow();
  });
});
