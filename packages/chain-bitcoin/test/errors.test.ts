import {
  BaseError,
  FeeTooLowError as CoreFeeTooLowError,
  InsufficientFundsError as CoreInsufficientFundsError,
} from "@openwallet/core";
import { describe, expect, it } from "vitest";
import { FeeTooLowError, InsufficientFundsError } from "../src/errors.js";

describe("FeeTooLowError", () => {
  it("re-exports core's FeeTooLowError unchanged", () => {
    expect(FeeTooLowError).toBe(CoreFeeTooLowError);
  });

  it("is a BaseError", () => {
    expect(new FeeTooLowError()).toBeInstanceOf(BaseError);
  });
});

describe("InsufficientFundsError", () => {
  it("re-exports core's InsufficientFundsError unchanged", () => {
    expect(InsufficientFundsError).toBe(CoreInsufficientFundsError);
  });

  it("is a BaseError", () => {
    expect(new InsufficientFundsError()).toBeInstanceOf(BaseError);
  });
});
