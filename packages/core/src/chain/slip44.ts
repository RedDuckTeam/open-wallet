/**
 * SLIP-44 registered coin types — the single source of truth every chain
 * package's own `*_COIN_TYPE` constant re-points to, instead of each one
 * hardcoding its own copy of the registry value.
 * https://github.com/satoshilabs/slips/blob/master/slip-0044.md
 */
export const SLIP44_BITCOIN = 0;
export const SLIP44_EVM = 60;
export const SLIP44_SOLANA = 501;
