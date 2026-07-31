import type { Address } from "viem";
import { describe, expect, it } from "vitest";
import { EVM_NATIVE_TRANSFER_GAS } from "../src/constants.js";
import { cancelTransfer, speedUpTransfer } from "../src/replace.js";
import { FeeTooLowError } from "../src/errors.js";

const FROM: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const TO: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const ORIGINAL_FEES = { maxFeePerGas: 30_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n };

describe("speedUpTransfer", () => {
  it("keeps the same nonce/to/value/data at higher fees", () => {
    const tx = speedUpTransfer({
      chainId: 1,
      nonce: 5,
      to: TO,
      value: 1_000n,
      data: "0xdeadbeef",
      gas: 21_000n,
      maxFeePerGas: 60_000_000_000n,
      maxPriorityFeePerGas: 2_000_000_000n,
      originalFees: ORIGINAL_FEES,
    });

    expect(tx.nonce).toBe(5);
    expect(tx.to).toBe(TO);
    expect(tx.value).toBe(1_000n);
    expect(tx.data).toBe("0xdeadbeef");
    expect(tx.maxFeePerGas).toBe(60_000_000_000n);
  });

  it("rejects a maxFeePerGas that isn't strictly higher than the original", () => {
    expect(() =>
      speedUpTransfer({
        chainId: 1,
        nonce: 5,
        to: TO,
        value: 1_000n,
        gas: 21_000n,
        maxFeePerGas: 30_000_000_000n,
        maxPriorityFeePerGas: 2_000_000_000n,
        originalFees: ORIGINAL_FEES,
      }),
    ).toThrow(FeeTooLowError);
  });

  it("rejects a maxPriorityFeePerGas that isn't strictly higher than the original", () => {
    expect(() =>
      speedUpTransfer({
        chainId: 1,
        nonce: 5,
        to: TO,
        value: 1_000n,
        gas: 21_000n,
        maxFeePerGas: 60_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
        originalFees: ORIGINAL_FEES,
      }),
    ).toThrow(FeeTooLowError);
  });

  it("rejects fees that are higher but don't clear the required 10% bump", () => {
    // 5% higher on both — genuinely higher, but geth's default mempool
    // PriceBump policy requires at least 10% or real nodes reject it as
    // underpriced.
    expect(() =>
      speedUpTransfer({
        chainId: 1,
        nonce: 5,
        to: TO,
        value: 1_000n,
        gas: 21_000n,
        maxFeePerGas: 31_500_000_000n,
        maxPriorityFeePerGas: 1_050_000_000n,
        originalFees: ORIGINAL_FEES,
      }),
    ).toThrow(FeeTooLowError);
  });

  it("accepts fees that meet the required 10% bump exactly", () => {
    const tx = speedUpTransfer({
      chainId: 1,
      nonce: 5,
      to: TO,
      value: 1_000n,
      gas: 21_000n,
      maxFeePerGas: 33_000_000_000n,
      maxPriorityFeePerGas: 1_100_000_000n,
      originalFees: ORIGINAL_FEES,
    });
    expect(tx.maxFeePerGas).toBe(33_000_000_000n);
  });
});

describe("cancelTransfer", () => {
  it("sends zero value to itself at the same nonce, with the protocol's base transfer gas", () => {
    const tx = cancelTransfer({
      chainId: 1,
      from: FROM,
      nonce: 5,
      maxFeePerGas: 60_000_000_000n,
      maxPriorityFeePerGas: 2_000_000_000n,
      originalFees: ORIGINAL_FEES,
    });

    expect(tx.nonce).toBe(5);
    expect(tx.to).toBe(FROM);
    expect(tx.value).toBe(0n);
    expect(tx.gas).toBe(EVM_NATIVE_TRANSFER_GAS);
  });

  it("rejects fees that aren't strictly higher than the original", () => {
    expect(() =>
      cancelTransfer({
        chainId: 1,
        from: FROM,
        nonce: 5,
        maxFeePerGas: 30_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
        originalFees: ORIGINAL_FEES,
      }),
    ).toThrow(FeeTooLowError);
  });

  it("rejects fees that are higher but don't clear the required 10% bump", () => {
    expect(() =>
      cancelTransfer({
        chainId: 1,
        from: FROM,
        nonce: 5,
        maxFeePerGas: 31_500_000_000n,
        maxPriorityFeePerGas: 1_050_000_000n,
        originalFees: ORIGINAL_FEES,
      }),
    ).toThrow(FeeTooLowError);
  });

  it("accepts fees that meet the required 10% bump exactly", () => {
    const tx = cancelTransfer({
      chainId: 1,
      from: FROM,
      nonce: 5,
      maxFeePerGas: 33_000_000_000n,
      maxPriorityFeePerGas: 1_100_000_000n,
      originalFees: ORIGINAL_FEES,
    });
    expect(tx.maxFeePerGas).toBe(33_000_000_000n);
  });
});
