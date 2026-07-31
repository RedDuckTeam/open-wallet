import type { Curve } from "../crypto/types.js";

/**
 * The narrow contract a chain package (`@openwallet/chain-*`) implements to
 * plug into `HdKeyring`. Deliberately small: derivation and address
 * encoding are the only things that are genuinely identical in shape across
 * chains. Transaction/message signing is NOT part of this interface —
 * an EVM tx, a Solana tx, and a Bitcoin PSBT have too little in common to
 * force through one signature without hiding chain-specific footguns
 * (e.g. EIP-1559 fee fields, Solana blockhash freshness, UTXO selection).
 * Each chain package exposes its own concrete signing API instead.
 */
export interface CoinEntry {
  /** Stable identifier, e.g. "evm", "solana", "bitcoin". */
  readonly id: string;
  readonly curve: Curve;
  /** BIP-32 path for a given account index, e.g. `m/44'/60'/0'/0/${accountIndex}`. */
  derivationPath(accountIndex: number): string;
  deriveAddress(publicKey: Uint8Array): string;
}

/** An account `HdKeyring` derived from the mnemonic — has a derivation path, unlike `ImportedAccount`. */
export interface Account {
  readonly coinId: string;
  readonly path: string;
  readonly address: string;
  readonly publicKey: Uint8Array;
  /** Never log, persist, or transmit this outside the immediate signing call site. */
  readonly privateKey: Uint8Array;
}

/** Public info for an imported account — no derivation path, unlike `Account`. */
export interface ImportedAccount {
  readonly coinId: string;
  readonly address: string;
  readonly publicKey: Uint8Array;
}
