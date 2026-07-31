import { HdKeyring, generateMnemonic } from "@openwallet/core";
import { base64 } from "@scure/base";
import { describe, expect, it } from "vitest";
import { bitcoinCoin } from "../src/coin.js";
import { signMessage, verifyMessage } from "../src/message.js";

// Independently generated with `bitcoinjs-message` (a widely-used reference
// implementation) for private key = 7 signing "hello openwallet", to prove
// this package's output actually interoperates with other wallets rather
// than just being internally self-consistent.
const KNOWN_PRIVATE_KEY = ((): Uint8Array => {
  const key = new Uint8Array(32);
  key[31] = 7;
  return key;
})();
const KNOWN_MESSAGE = "hello openwallet";
const KNOWN_SIGNATURE =
  "KACti4Mb5h6h7+l/lmvZYM+8jisskRdSrc4GvRtGEdgMeoszEnqdRQgttBXlDR96lffbonRIYVqIBSifqSe6QfQ=";
const KNOWN_ADDRESS = "bc1qthklh702txwafc72d2qtxv7ywt7sk0mfy3mw6y";

describe("signMessage", () => {
  it("matches the known signature from an independent implementation", () => {
    expect(signMessage(KNOWN_PRIVATE_KEY, KNOWN_MESSAGE)).toBe(KNOWN_SIGNATURE);
  });

  it("produces a signature verifyMessage accepts for the signing account's own address", () => {
    const account = HdKeyring.fromMnemonic(generateMnemonic()).deriveAccount(bitcoinCoin, 0);
    const signature = signMessage(account.privateKey, "prove I own this address");
    expect(verifyMessage(account.address, "prove I own this address", signature)).toBe(true);
  });
});

describe("verifyMessage", () => {
  it("accepts the known signature for the known address", () => {
    expect(verifyMessage(KNOWN_ADDRESS, KNOWN_MESSAGE, KNOWN_SIGNATURE)).toBe(true);
  });

  it("rejects the right signature for the wrong message", () => {
    expect(verifyMessage(KNOWN_ADDRESS, "a different message", KNOWN_SIGNATURE)).toBe(false);
  });

  it("rejects the right signature for the wrong address", () => {
    expect(
      verifyMessage("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", KNOWN_MESSAGE, KNOWN_SIGNATURE),
    ).toBe(false);
  });

  it("rejects a malformed base64 signature instead of throwing", () => {
    expect(verifyMessage(KNOWN_ADDRESS, KNOWN_MESSAGE, "not-valid-base64!!!")).toBe(false);
  });

  it("rejects a signature with a header byte outside the p2wpkh range", () => {
    // A legitimate P2PKH-style header (27-30) — not a format this package
    // signs with, and not one it should claim to verify either.
    const tampered = base64.decode(KNOWN_SIGNATURE);
    tampered[0] = 27;
    expect(verifyMessage(KNOWN_ADDRESS, KNOWN_MESSAGE, base64.encode(tampered))).toBe(false);
  });
});
