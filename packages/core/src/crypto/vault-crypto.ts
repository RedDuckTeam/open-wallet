import { gcm } from "@noble/ciphers/aes.js";
import { randomBytes } from "@noble/hashes/utils.js";

export const NONCE_LENGTH = 12;
const KEY_LENGTH = 32;

export interface Encrypted {
  readonly nonce: Uint8Array;
  readonly ciphertext: Uint8Array;
}

/** AES-256-GCM with a fresh random nonce every call — a nonce must never repeat for the same key. */
export function encrypt(key: Uint8Array, plaintext: Uint8Array): Encrypted {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${String(KEY_LENGTH)} bytes`);
  }
  const nonce = randomBytes(NONCE_LENGTH);
  return { nonce, ciphertext: gcm(key, nonce).encrypt(plaintext) };
}

/**
 * Throws if `key` is wrong or `ciphertext` was tampered with — GCM verifies
 * its authentication tag before returning plaintext, so a failed decrypt
 * doubles as "wrong password" detection. No separate password hash needed.
 */
export function decrypt(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return gcm(key, nonce).decrypt(ciphertext);
}
