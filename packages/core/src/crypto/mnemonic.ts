import {
  generateMnemonic as scureGenerateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic as scureValidateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { DEFAULT_MNEMONIC_STRENGTH_BITS } from "./constants.js";

export function generateMnemonic(strengthBits: number = DEFAULT_MNEMONIC_STRENGTH_BITS): string {
  return scureGenerateMnemonic(wordlist, strengthBits);
}

export function validateMnemonic(mnemonic: string): boolean {
  return scureValidateMnemonic(mnemonic, wordlist);
}

/** BIP-39 seed derivation. `passphrase` is the optional "25th word" — a second factor the mnemonic alone can't reproduce. */
export function mnemonicToSeed(mnemonic: string, passphrase = ""): Uint8Array {
  return mnemonicToSeedSync(mnemonic, passphrase);
}
