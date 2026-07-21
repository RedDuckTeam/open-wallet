import { networks } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";
import { isValidAddress } from "../src/validate.js";

describe("isValidAddress", () => {
  it("accepts a native SegWit (bech32) address", () => {
    expect(isValidAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe(true);
  });

  it("accepts a legacy p2pkh address", () => {
    expect(isValidAddress("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2")).toBe(true);
  });

  it("accepts a p2sh address", () => {
    expect(isValidAddress("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy")).toBe(true);
  });

  it("rejects a malformed address", () => {
    expect(isValidAddress("not-a-bitcoin-address")).toBe(false);
  });

  it("rejects a mainnet address when checking against testnet", () => {
    expect(isValidAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", networks.testnet)).toBe(
      false,
    );
  });

  it("accepts a testnet address when checking against testnet", () => {
    expect(isValidAddress("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", networks.testnet)).toBe(
      true,
    );
  });
});
