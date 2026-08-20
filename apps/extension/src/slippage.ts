/**
 * The slippage policy, in one place for both the setting and its use.
 *
 * Slippage is the one swap parameter a user can genuinely need to change —
 * a volatile pair won't fill at 0.5%, a stable pair shouldn't be given more —
 * and also the easiest to hurt themselves with, so the range is bounded:
 *
 * - below 0.05% virtually every quote fails at execution, which reads as a
 *   broken wallet rather than a tight tolerance;
 * - above 5% the protection stops meaning anything — a sandwich bot will
 *   happily take the whole allowance, so larger values are refused outright
 *   rather than warned about;
 * - above 1% is legitimate but worth a warning, since most users who set it
 *   are trying to push a trade through a pool that is telling them no.
 *
 * Values are held as percent (0.5 means 0.5%) because that is the unit every
 * wallet UI speaks; aggregators want a fraction, hence `slippageFraction`.
 */
export const DEFAULT_SLIPPAGE_PCT = 0.5;
export const MIN_SLIPPAGE_PCT = 0.05;
export const MAX_SLIPPAGE_PCT = 5;
/** Not a limit — the threshold past which the UI warns. */
export const HIGH_SLIPPAGE_PCT = 1;

/** Preset choices offered by the UI, all comfortably inside the bounds. */
export const SLIPPAGE_PRESETS_PCT: readonly number[] = [0.1, 0.5, 1];

/**
 * Validates a user-entered value, returning it normalized. Throws with text
 * written for the person who typed it — this message is shown verbatim.
 */
export function validateSlippagePct(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Enter slippage as a number, e.g. 0.5.");
  }
  if (value < MIN_SLIPPAGE_PCT || value > MAX_SLIPPAGE_PCT) {
    throw new Error(
      `Slippage must be between ${String(MIN_SLIPPAGE_PCT)}% and ${String(MAX_SLIPPAGE_PCT)}%.`,
    );
  }
  // Two decimals is the finest anyone reasons in ("0.75%"), and rounding here
  // keeps the persisted value equal to the displayed one.
  return Math.round(value * 100) / 100;
}

/**
 * Defensive read of a persisted value: settings written by another build (or
 * by hand) must degrade to the default, never reach an aggregator as garbage.
 */
export function sanitizeSlippagePct(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SLIPPAGE_PCT;
  if (value < MIN_SLIPPAGE_PCT || value > MAX_SLIPPAGE_PCT) return DEFAULT_SLIPPAGE_PCT;
  return value;
}

/** Percent to the fraction aggregators expect: 0.5% -> 0.005. */
export function slippageFraction(pct: number): number {
  return pct / 100;
}
