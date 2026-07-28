import {
  BaseError,
  FeeTooLowError,
  InsufficientFundsError,
  InvalidAddressError,
  VaultUnlockError,
} from "@openwallet/core";
import { WalletErrorCode } from "../messaging/protocol.js";

// code is an own property so it survives the wire (serialize-error keeps `code`),
// letting the popup tell errors apart without importing core error classes.
export class WalletError extends Error {
  constructor(
    readonly code: WalletErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WalletError";
  }
}

// RPC nodes report failures as free text, so we match on wording. Most-specific
// first; first match wins.
const MESSAGE_PATTERNS: readonly (readonly [RegExp, WalletErrorCode])[] = [
  [
    /insufficient funds|insufficient balance|exceeds balance|not enough/i,
    WalletErrorCode.InsufficientFunds,
  ],
  [/nonce too low|nonce has already been used|already known/i, WalletErrorCode.NonceTooLow],
  [
    /replacement transaction underpriced|transaction underpriced|max fee per gas less than/i,
    WalletErrorCode.TxUnderpriced,
  ],
  [
    /intrinsic gas too low|gas required exceeds|cannot estimate gas|execution reverted|out of gas|unpredictable gas/i,
    WalletErrorCode.GasEstimationFailed,
  ],
  [/fee too low|min relay fee|dust/i, WalletErrorCode.FeeTooLow],
  [/rate limit|too many requests|\b429\b|access forbidden|\b403\b/i, WalletErrorCode.RateLimited],
  [/timed out|timeout|deadline exceeded/i, WalletErrorCode.Timeout],
  [
    /failed to fetch|network error|load failed|fetch failed|econnrefused|enotfound|dns/i,
    WalletErrorCode.NetworkError,
  ],
  [
    /invalid mnemonic|invalid secret recovery phrase|invalid checksum|word not found/i,
    WalletErrorCode.InvalidMnemonic,
  ],
  [/invalid private key|invalid key length|invalid hex/i, WalletErrorCode.InvalidPrivateKey],
  [/invalid address|bad address|checksum/i, WalletErrorCode.InvalidAddress],
  [/wallet is locked|is locked/i, WalletErrorCode.Locked],
  [
    /http request failed|rpc|json-?rpc|server error|bad gateway|service unavailable/i,
    WalletErrorCode.RpcError,
  ],
];

// Flattens the error and its cause chain into one string. viem nests the node's
// real message in shortMessage/details, not message. Depth-bounded for cycles.
function collectText(error: unknown, depth = 0): string {
  if (depth > 4 || error === null || typeof error !== "object") {
    return typeof error === "string" ? error : "";
  }
  const record = error as Record<string, unknown>;
  const parts = ["message", "shortMessage", "details", "reason"]
    .map((key) => (typeof record[key] === "string" ? (record[key] as string) : ""))
    .filter(Boolean);
  return [...parts, collectText(record.cause, depth + 1)].join(" ");
}

// instanceof the core classes first (precise), then fall back to message matching.
function classify(error: unknown): WalletErrorCode {
  if (error instanceof InsufficientFundsError) return WalletErrorCode.InsufficientFunds;
  if (error instanceof InvalidAddressError) return WalletErrorCode.InvalidAddress;
  if (error instanceof FeeTooLowError) return WalletErrorCode.FeeTooLow;
  if (error instanceof VaultUnlockError) return WalletErrorCode.WrongPassword;

  const text = collectText(error);
  for (const [pattern, code] of MESSAGE_PATTERNS) {
    if (pattern.test(text)) return code;
  }
  return WalletErrorCode.Unknown;
}

export function toWalletError(error: unknown): WalletError {
  if (error instanceof WalletError) return error;
  const message =
    error instanceof BaseError
      ? error.shortMessage
      : error instanceof Error
        ? error.message
        : "Something went wrong";
  return new WalletError(classify(error), message);
}
