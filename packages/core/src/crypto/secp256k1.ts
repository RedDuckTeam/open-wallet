import { HDKey } from "@scure/bip32";
import type { DerivedKey } from "./types.js";

/** Standard BIP-32 derivation over secp256k1 — shared by every secp256k1 chain (EVM, Bitcoin, ...). */
export function deriveSecp256k1(seed: Uint8Array, path: string): DerivedKey {
  const node = HDKey.fromMasterSeed(seed).derive(path);
  if (!node.privateKey || !node.publicKey) {
    throw new Error(`secp256k1 derivation for path "${path}" did not yield a key pair`);
  }
  return { publicKey: node.publicKey, privateKey: node.privateKey };
}
