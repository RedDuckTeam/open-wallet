import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import type { Curve } from "./types.js";

/** Computes the public key for a raw private key — used for imported keys, which have no HD derivation to fall back on. */
export function derivePublicKey(curve: Curve, privateKey: Uint8Array): Uint8Array {
  return curve === "secp256k1"
    ? secp256k1.getPublicKey(privateKey, true)
    : ed25519.getPublicKey(privateKey);
}
