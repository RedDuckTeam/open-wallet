import { scryptAsync } from "@noble/hashes/scrypt.js";
import type { KdfParams } from "./types.js";
import { DEFAULT_KDF_PARAMS } from "./constants.js";

const DERIVED_KEY_LENGTH = 32;

export async function deriveKey(
  password: string,
  salt: Uint8Array,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<Uint8Array> {
  return scryptAsync(password, salt, { ...params, dkLen: DERIVED_KEY_LENGTH });
}
