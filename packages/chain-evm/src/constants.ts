import { SLIP44_EVM } from "@openwallet/core";

/**
 * SLIP-44 registered coin type for Ethereum — shared by every EVM chain
 * (Polygon, Arbitrum, Base, ...), since they all use the same address
 * format and the registry has no separate entry per EVM chain.
 * https://github.com/satoshilabs/slips/blob/master/slip-0044.md
 */
export const EVM_COIN_TYPE = SLIP44_EVM;

/** Base gas cost of a plain value transfer (no calldata, no contract execution) — fixed by the protocol, not an estimate. */
export const EVM_NATIVE_TRANSFER_GAS = 21_000n;

/**
 * Minimum percentage a replacement transaction's `maxFeePerGas` and
 * `maxPriorityFeePerGas` must each exceed the original by — not just any
 * amount higher. This is go-ethereum's default mempool `PriceBump` (the
 * `legacypool`/`blobpool` config both default to 10), which every major
 * node runs; a replacement that's merely 1 wei higher passes BIP-125-style
 * "strictly higher" logic but gets rejected by real nodes as
 * "replacement transaction underpriced."
 * https://github.com/ethereum/go-ethereum/blob/master/core/txpool/legacypool/legacypool.go
 */
export const MIN_REPLACEMENT_FEE_BUMP_PERCENT = 10n;
