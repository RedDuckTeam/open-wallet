import { describe, expect, it } from "vitest";
import {
  hdAccountId,
  importedAccountId,
  parseAccountId,
} from "../../apps/extension/src/background/account-id.js";
import { AccountType, ChainKind } from "../../apps/extension/src/messaging/protocol.js";

describe("account-id", () => {
  it("formats and parses HD ids", () => {
    expect(hdAccountId(0)).toBe("hd:0");
    expect(hdAccountId(7)).toBe("hd:7");
    expect(parseAccountId("hd:7")).toEqual({ type: AccountType.Hd, index: 7 });
  });

  it("formats and parses imported ids", () => {
    const id = importedAccountId(ChainKind.Evm, "0xAbC0000000000000000000000000000000000001");
    expect(id).toBe("imported:evm:0xAbC0000000000000000000000000000000000001");
    expect(parseAccountId(id)).toEqual({
      type: AccountType.Imported,
      coinId: ChainKind.Evm,
      address: "0xAbC0000000000000000000000000000000000001",
    });
  });

  it("round-trips through parse for both kinds", () => {
    for (const id of [hdAccountId(3), importedAccountId(ChainKind.Solana, "So1anaAddr")]) {
      const ref = parseAccountId(id);
      const back =
        ref.type === AccountType.Hd
          ? hdAccountId(ref.index)
          : importedAccountId(ref.coinId, ref.address);
      expect(back).toBe(id);
    }
  });

  it("preserves an address that itself contains the separator", () => {
    const id = importedAccountId(ChainKind.Bitcoin, "a:b:c");
    expect(parseAccountId(id)).toEqual({
      type: AccountType.Imported,
      coinId: ChainKind.Bitcoin,
      address: "a:b:c",
    });
  });
});
