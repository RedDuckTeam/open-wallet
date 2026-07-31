import type { Commitment } from "@solana/web3.js";
import { SLIP44_SOLANA } from "@openwallet/core";

/**
 * SLIP-44 registered coin type for Solana.
 * https://github.com/satoshilabs/slips/blob/master/slip-0044.md
 */
export const SOLANA_COIN_TYPE = SLIP44_SOLANA;

/** How many confirmations a read/broadcast waits for by default — Solana's usual balance between speed and finality risk. */
export const DEFAULT_COMMITMENT: Commitment = "confirmed";
