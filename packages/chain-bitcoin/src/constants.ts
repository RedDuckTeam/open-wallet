import { SLIP44_BITCOIN } from "@openwallet/core";

/**
 * SLIP-44 registered coin type for Bitcoin.
 * https://github.com/satoshilabs/slips/blob/master/slip-0044.md
 */
export const BITCOIN_COIN_TYPE = SLIP44_BITCOIN;

/** SLIP-44 coin type 1 ("Testnet, all coins"), used by every Bitcoin testnet. */
export const BITCOIN_TESTNET_COIN_TYPE = 1;

/** BIP-84 purpose field — native SegWit (p2wpkh). See `coin.ts` for why this is the only scheme this package derives. */
export const BITCOIN_BIP84_PURPOSE = 84;

/** Standard dust limit for a p2wpkh output, in satoshis (BIP-doc convention, matches Bitcoin Core's default `-dustrelayfee`). Change below this is folded into the fee instead of created as an output. */
export const DUST_THRESHOLD_SATS = 546;

/**
 * Widely-used p2wpkh transaction-size approximation, in vbytes: fixed
 * overhead (version, locktime, segwit marker/flag, varints) plus a
 * per-input and per-output cost. Not an exact weight calculation — good
 * enough to pick a fee that gets confirmed. A platform wanting
 * penny-accurate fees should compute the real weight from the finished
 * transaction instead.
 */
export const TX_BASE_VBYTES = 10;
export const TX_INPUT_VBYTES = 68;
export const TX_OUTPUT_VBYTES = 31;

/**
 * BIP-125 opt-in replace-by-fee signal: any input sequence number below
 * `0xfffffffe` marks the transaction as replaceable. `0xfffffffd` is the
 * conventional choice (used by Bitcoin Core's `-walletrbf` and effectively
 * every wallet that supports it) — RBF-replaceable while leaving locktime
 * unused, same as this package's PSBTs already do.
 * https://github.com/bitcoin/bips/blob/master/bip-0125.mediawiki
 */
export const RBF_SEQUENCE = 0xfffffffd;

/**
 * Bitcoin Core's default `-incrementalrelayfee` (mempool replacement rule
 * 4): a replacement must pay a *higher absolute fee* by an amount that
 * itself covers at least this rate over the replacement's own vsize — a
 * replacement that's merely 1 sat more expensive passes a naive "strictly
 * higher" check but gets rejected by real nodes as failing to "pay for its
 * own bandwidth."
 * https://github.com/bitcoin/bitcoin/blob/master/doc/policy/mempool-replacements.md
 */
export const INCREMENTAL_RELAY_FEE_SATS_PER_VBYTE = 0.1;
