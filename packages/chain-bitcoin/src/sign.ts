import type { Psbt } from "bitcoinjs-lib";
import { ECPair } from "./ecc.js";

/**
 * Signs every input `privateKey` can sign. Deliberately does NOT call
 * `finalizeAllInputs()` — a PSBT can hold inputs this key can't sign that
 * aren't finalizable yet, so finalizing is the caller's decision once all
 * required signatures are present.
 */
export function signPsbt(privateKey: Uint8Array, psbt: Psbt): Psbt {
  const keyPair = ECPair.fromPrivateKey(privateKey);
  psbt.signAllInputs(keyPair);
  return psbt;
}
