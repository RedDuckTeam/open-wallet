import { toast } from "sonner";
import { WalletErrorCode } from "../../messaging/protocol.js";

export interface PresentedError {
  readonly title: string;
  readonly message: string;
  // "warning" for transient/connectivity issues, "error" otherwise.
  readonly tone: "error" | "warning";
}

// User-facing copy per error code. Exhaustive Record, so a new code must get copy.
const COPY: Record<WalletErrorCode, PresentedError> = {
  [WalletErrorCode.InvalidAddress]: {
    title: "Invalid address",
    message: "That recipient isn't a valid address for this network.",
    tone: "error",
  },
  [WalletErrorCode.InvalidMnemonic]: {
    title: "Invalid recovery phrase",
    message: "Check the words and their order, then try again.",
    tone: "error",
  },
  [WalletErrorCode.InvalidPrivateKey]: {
    title: "Invalid private key",
    message: "That doesn't look like a valid private key for this network.",
    tone: "error",
  },
  [WalletErrorCode.WrongPassword]: {
    title: "Incorrect password",
    message: "The password didn't match. Try again.",
    tone: "error",
  },
  [WalletErrorCode.Locked]: {
    title: "Wallet locked",
    message: "Unlock your wallet and try again.",
    tone: "error",
  },
  [WalletErrorCode.InsufficientFunds]: {
    title: "Insufficient funds",
    message: "Not enough balance to cover the amount plus the network fee.",
    tone: "error",
  },
  [WalletErrorCode.SlippageExceeded]: {
    title: "Price moved",
    message: "The price moved beyond your slippage tolerance. Get a fresh quote and try again.",
    tone: "warning",
  },
  [WalletErrorCode.QuoteExpired]: {
    title: "Quote expired",
    message: "This quote is no longer valid. Get a fresh one and try again.",
    tone: "warning",
  },
  [WalletErrorCode.FeeTooLow]: {
    title: "Fee too low",
    message: "The network fee is too low right now. Try again in a moment.",
    tone: "warning",
  },
  [WalletErrorCode.NonceTooLow]: {
    title: "Transaction conflict",
    message: "A pending transaction is still in flight. Wait for it to confirm, then retry.",
    tone: "warning",
  },
  [WalletErrorCode.TxUnderpriced]: {
    title: "Fee too low",
    message: "The network needs a higher fee than offered. Try again.",
    tone: "warning",
  },
  [WalletErrorCode.GasEstimationFailed]: {
    title: "Transaction would fail",
    message: "This transaction can't be estimated. It would likely revert on-chain.",
    tone: "error",
  },
  [WalletErrorCode.NetworkError]: {
    title: "Connection problem",
    message: "Couldn't reach the network. Check your connection or the RPC endpoint.",
    tone: "warning",
  },
  [WalletErrorCode.RateLimited]: {
    title: "Rate limited",
    message: "The RPC endpoint is throttling requests. Wait a moment, or set a custom RPC.",
    tone: "warning",
  },
  [WalletErrorCode.Timeout]: {
    title: "Request timed out",
    message: "The network took too long to respond. Try again.",
    tone: "warning",
  },
  [WalletErrorCode.RpcError]: {
    title: "Node error",
    message: "The RPC endpoint returned an error. Try again, or switch RPC.",
    tone: "warning",
  },
  [WalletErrorCode.Unknown]: {
    title: "Something went wrong",
    message: "Something went wrong. Please try again.",
    tone: "error",
  },
};

const CODES = new Set<string>(Object.values(WalletErrorCode));

// The code the background tagged the error with, if any (rides on error.code).
function codeOf(error: unknown): WalletErrorCode | null {
  if (error !== null && typeof error === "object" && "code" in error) {
    const { code } = error as { code: unknown };
    if (typeof code === "string" && CODES.has(code)) return code as WalletErrorCode;
  }
  return null;
}

// Tailored copy per code; falls back to the raw message for unknown errors.
export function presentError(error: unknown): PresentedError {
  const code = codeOf(error);
  if (code) return COPY[code];
  const raw = error instanceof Error ? error.message : "";
  return {
    ...COPY[WalletErrorCode.Unknown],
    message: raw || COPY[WalletErrorCode.Unknown].message,
  };
}

// Inline message for a Callout (the common case).
export function errorMessage(error: unknown): string {
  return presentError(error).message;
}

// Toast, for failures with no inline home (background loads, global actions).
export function notifyError(error: unknown): void {
  const { title, message } = presentError(error);
  toast.error(title, { description: message });
}
