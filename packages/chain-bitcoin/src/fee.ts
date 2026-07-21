import { TX_BASE_VBYTES, TX_INPUT_VBYTES, TX_OUTPUT_VBYTES } from "./constants.js";

/** Rough p2wpkh vsize estimate (see the constants' own docs) — shared by `transfer.ts` and `rbf.ts`. */
export function estimateVsize(inputCount: number, outputCount: number): number {
  return TX_BASE_VBYTES + inputCount * TX_INPUT_VBYTES + outputCount * TX_OUTPUT_VBYTES;
}
