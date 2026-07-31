import { describe, expect, it } from "vitest";
import { SLIP44_BITCOIN, SLIP44_EVM, SLIP44_SOLANA } from "../../src/chain/slip44.js";

describe("SLIP-44 coin types", () => {
  it("matches the registered values", () => {
    expect(SLIP44_BITCOIN).toBe(0);
    expect(SLIP44_EVM).toBe(60);
    expect(SLIP44_SOLANA).toBe(501);
  });
});
