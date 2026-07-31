import { describe, expect, it } from "vitest";
import { InsufficientFundsError, InvalidAddressError } from "@openwallet/core";
import { toWalletError, WalletError } from "../../apps/extension/src/background/errors.js";
import { WalletErrorCode } from "../../apps/extension/src/messaging/protocol.js";

const codeOf = (error: unknown): string => toWalletError(error).code;

describe("toWalletError", () => {
  it("classifies core error classes precisely", () => {
    expect(codeOf(new InsufficientFundsError())).toBe(WalletErrorCode.InsufficientFunds);
    expect(codeOf(new InvalidAddressError())).toBe(WalletErrorCode.InvalidAddress);
  });

  it("classifies RPC/node messages by wording", () => {
    expect(codeOf(new Error("nonce too low"))).toBe(WalletErrorCode.NonceTooLow);
    expect(codeOf(new Error("replacement transaction underpriced"))).toBe(
      WalletErrorCode.TxUnderpriced,
    );
    expect(codeOf(new Error("execution reverted"))).toBe(WalletErrorCode.GasEstimationFailed);
    expect(codeOf(new Error("insufficient funds for gas * price + value"))).toBe(
      WalletErrorCode.InsufficientFunds,
    );
  });

  it("classifies connectivity failures", () => {
    expect(codeOf(new TypeError("Failed to fetch"))).toBe(WalletErrorCode.NetworkError);
    expect(codeOf(new Error('403 : {"message":"Access forbidden"}'))).toBe(
      WalletErrorCode.RateLimited,
    );
  });

  it("walks the cause chain (viem wraps the node error deep)", () => {
    const wrapped = new Error("HTTP request failed", { cause: new Error("nonce too low") });
    expect(codeOf(wrapped)).toBe(WalletErrorCode.NonceTooLow);
  });

  it("reads viem-style shortMessage/details fields", () => {
    const viemLike = Object.assign(new Error("wrapper"), {
      shortMessage: "The total cost exceeds balance",
    });
    expect(codeOf(viemLike)).toBe(WalletErrorCode.InsufficientFunds);
  });

  it("falls back to Unknown and keeps the original message", () => {
    const error = toWalletError(new Error("a very novel failure"));
    expect(error.code).toBe(WalletErrorCode.Unknown);
    expect(error.message).toBe("a very novel failure");
  });

  it("is idempotent on an already-coded WalletError", () => {
    const original = new WalletError(WalletErrorCode.FeeTooLow, "too low");
    expect(toWalletError(original)).toBe(original);
  });
});
