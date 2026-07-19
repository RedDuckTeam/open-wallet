import { describe, expect, it } from "vitest";
import { isValidAddress } from "../src/validate.js";

describe("isValidAddress", () => {
  it("accepts a correctly checksummed address", () => {
    expect(isValidAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")).toBe(true);
  });

  it("accepts an all-lowercase address (no checksum info to contradict)", () => {
    expect(isValidAddress("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266")).toBe(true);
  });

  it("rejects an address with an incorrect checksum casing", () => {
    // Same address as the first case, with one letter's case flipped.
    expect(isValidAddress("0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266")).toBe(false);
  });

  it("rejects a malformed address", () => {
    expect(isValidAddress("not-an-address")).toBe(false);
    expect(isValidAddress("0x1234")).toBe(false);
  });
});
