import { describe, expect, it } from "vitest";
import {
  BaseError,
  FeeTooLowError,
  InsufficientFundsError,
  InvalidAddressError,
} from "../src/errors.js";

describe("BaseError", () => {
  it("assembles shortMessage and details into message", () => {
    const error = new BaseError("short summary", "extra detail");
    expect(error.shortMessage).toBe("short summary");
    expect(error.details).toBe("extra detail");
    expect(error.message).toContain("short summary");
    expect(error.message).toContain("extra detail");
  });

  it("uses shortMessage as message when no details are given", () => {
    const error = new BaseError("short summary");
    expect(error.message).toBe("short summary");
    expect(error.details).toBeUndefined();
  });
});

describe("chain-agnostic error hierarchy", () => {
  it("FeeTooLowError is a BaseError with a generic default message", () => {
    const error = new FeeTooLowError();
    expect(error).toBeInstanceOf(BaseError);
    expect(error.name).toBe("FeeTooLowError");
    expect(error.message.length).toBeGreaterThan(0);
  });

  it("InsufficientFundsError is a BaseError with a generic default message", () => {
    const error = new InsufficientFundsError();
    expect(error).toBeInstanceOf(BaseError);
    expect(error.name).toBe("InsufficientFundsError");
    expect(error.message.length).toBeGreaterThan(0);
  });

  it("InvalidAddressError is a BaseError with a generic default message", () => {
    const error = new InvalidAddressError();
    expect(error).toBeInstanceOf(BaseError);
    expect(error.name).toBe("InvalidAddressError");
    expect(error.message.length).toBeGreaterThan(0);
  });

  it("subclasses accept an overriding message", () => {
    const error = new FeeTooLowError("chain-specific wording");
    expect(error.message).toBe("chain-specific wording");
  });
});
