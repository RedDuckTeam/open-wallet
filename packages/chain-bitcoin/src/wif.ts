import { networks, type Network } from "bitcoinjs-lib";
import { ECPair } from "./ecc.js";

/**
 * Encodes a raw private key as Wallet Import Format — the format Bitcoin
 * wallets conventionally exchange keys in (what a user pastes into
 * "import wallet by private key"), rather than raw hex. Always encodes
 * for a compressed public key, matching this package's p2wpkh-only address
 * derivation (`coin.ts`).
 */
export function privateKeyToWif(
  privateKey: Uint8Array,
  network: Network = networks.bitcoin,
): string {
  return ECPair.fromPrivateKey(privateKey, { network, compressed: true }).toWIF();
}

/**
 * Decodes a WIF string back to the raw 32-byte private key. Ignores
 * whichever compressed/uncompressed flag the WIF itself carries — the
 * underlying scalar is identical either way, and this package always
 * derives a compressed (p2wpkh) address from it regardless of where the
 * key originally came from.
 */
export function wifToPrivateKey(wif: string, network: Network = networks.bitcoin): Uint8Array {
  const keyPair = ECPair.fromWIF(wif, network);
  if (!keyPair.privateKey) {
    throw new Error("WIF string did not decode to a private key");
  }
  return keyPair.privateKey;
}
