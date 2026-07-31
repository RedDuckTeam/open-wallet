import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { derivePublicKey } from "../../src/crypto/public-key.js";

describe("derivePublicKey", () => {
  it("secp256k1: private key 1 is the well-known generator point G (compressed)", () => {
    const privateKey = new Uint8Array(32);
    privateKey[31] = 1;
    expect(bytesToHex(derivePublicKey("secp256k1", privateKey))).toBe(
      "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    );
  });

  it("ed25519: matches noble/curves' own getPublicKey", () => {
    const privateKey = new Uint8Array(32).fill(7);
    expect(derivePublicKey("ed25519", privateKey)).toEqual(ed25519.getPublicKey(privateKey));
  });
});
