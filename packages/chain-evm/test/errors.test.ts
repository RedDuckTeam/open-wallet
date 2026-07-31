import { BaseError, FeeTooLowError as CoreFeeTooLowError } from "@openwallet/core";
import { describe, expect, it } from "vitest";
import { FeeTooLowError } from "../src/errors.js";

describe("FeeTooLowError", () => {
  it("re-exports core's FeeTooLowError unchanged", () => {
    expect(FeeTooLowError).toBe(CoreFeeTooLowError);
  });

  it("is a BaseError", () => {
    expect(new FeeTooLowError()).toBeInstanceOf(BaseError);
  });
});
