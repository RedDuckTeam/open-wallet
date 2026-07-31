import { describe, expect, it } from "vitest";
import { toBaseUnits } from "../../apps/extension/src/units.js";

describe("toBaseUnits", () => {
  it("scales whole numbers by the decimals", () => {
    expect(toBaseUnits("1", 18)).toBe(1_000_000_000_000_000_000n);
    expect(toBaseUnits("10", 8)).toBe(1_000_000_000n);
    expect(toBaseUnits("0", 18)).toBe(0n);
  });

  it("handles fractional amounts", () => {
    expect(toBaseUnits("1.5", 18)).toBe(1_500_000_000_000_000_000n);
    expect(toBaseUnits("0.000001", 6)).toBe(1n);
    expect(toBaseUnits("1.23", 2)).toBe(123n);
  });

  it("truncates fraction digits beyond `decimals` (never rounds up)", () => {
    expect(toBaseUnits("1.239", 2)).toBe(123n);
    expect(toBaseUnits("0.9999999999", 2)).toBe(99n);
  });

  it("treats blank and separator-only input as zero", () => {
    expect(toBaseUnits("", 18)).toBe(0n);
    expect(toBaseUnits("   ", 18)).toBe(0n);
    expect(toBaseUnits(".", 18)).toBe(0n);
  });

  it("supports zero-decimal assets", () => {
    expect(toBaseUnits("42", 0)).toBe(42n);
    expect(toBaseUnits("42.9", 0)).toBe(42n);
  });

  it("carries a negative sign", () => {
    expect(toBaseUnits("-1", 18)).toBe(-1_000_000_000_000_000_000n);
  });
});
