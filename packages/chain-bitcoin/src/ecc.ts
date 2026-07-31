import * as ecc from "@bitcoinerlab/secp256k1";
import { initEccLib } from "bitcoinjs-lib";
import { ECPairFactory, type ECPairAPI } from "ecpair";

// bitcoinjs-lib ships no ECC implementation itself (to stay small and let
// callers pick); every consumer must register one before touching a PSBT
// or an ECPair. Centralized here so `sign.ts` and `wif.ts` share one
// registration instead of each doing it independently.
initEccLib(ecc);

export const ECPair: ECPairAPI = ECPairFactory(ecc);
