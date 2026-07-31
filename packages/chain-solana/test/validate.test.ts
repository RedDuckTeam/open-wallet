import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { isValidAddress } from "../src/validate.js";

describe("isValidAddress", () => {
  it("accepts a real base58-encoded public key", () => {
    expect(isValidAddress(Keypair.generate().publicKey.toBase58())).toBe(true);
  });

  it("accepts the system program's default (all-zero) address", () => {
    expect(isValidAddress(PublicKey.default.toBase58())).toBe(true);
  });

  it("rejects a malformed address", () => {
    expect(isValidAddress("not-a-solana-address")).toBe(false);
  });

  it("rejects a base58 string that isn't 32 bytes", () => {
    expect(isValidAddress("11111111111111111111111111111")).toBe(false);
  });
});
