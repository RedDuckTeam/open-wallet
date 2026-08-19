import { describe, expect, it } from "vitest";
import {
  DEFAULT_SLIPPAGE_PCT,
  MAX_SLIPPAGE_PCT,
  MIN_SLIPPAGE_PCT,
  sanitizeSlippagePct,
  slippageFraction,
  validateSlippagePct,
} from "../../apps/extension/src/slippage.js";

describe("validateSlippagePct", () => {
  it("accepts values inside the bounds and normalizes precision", () => {
    expect(validateSlippagePct(0.5)).toBe(0.5);
    expect(validateSlippagePct(MIN_SLIPPAGE_PCT)).toBe(MIN_SLIPPAGE_PCT);
    expect(validateSlippagePct(MAX_SLIPPAGE_PCT)).toBe(MAX_SLIPPAGE_PCT);
    // Sub-percent noise is rounded so the stored value equals the shown one.
    expect(validateSlippagePct(0.7549)).toBe(0.75);
  });

  it("rejects out-of-bounds and non-numeric input with user-facing text", () => {
    // Below the floor a swap simply never fills; above the cap the
    // protection is decorative — both are refused, not clamped silently.
    expect(() => validateSlippagePct(0.01)).toThrow(/between/);
    expect(() => validateSlippagePct(12)).toThrow(/between/);
    expect(() => validateSlippagePct(Number.NaN)).toThrow(/number/i);
    expect(() => validateSlippagePct(Number.POSITIVE_INFINITY)).toThrow(/number/i);
  });
});

describe("sanitizeSlippagePct", () => {
  it("passes a sane persisted value through", () => {
    expect(sanitizeSlippagePct(1.5)).toBe(1.5);
  });

  it("degrades garbage to the default instead of forwarding it", () => {
    // A settings blob written by another build (or by hand) must never
    // reach an aggregator as-is.
    for (const garbage of ["0.5", null, undefined, -1, 50, Number.NaN, {}]) {
      expect(sanitizeSlippagePct(garbage)).toBe(DEFAULT_SLIPPAGE_PCT);
    }
  });
});

describe("slippageFraction", () => {
  it("converts percent to the fraction aggregators expect", () => {
    expect(slippageFraction(0.5)).toBeCloseTo(0.005);
    expect(slippageFraction(5)).toBeCloseTo(0.05);
  });
});
