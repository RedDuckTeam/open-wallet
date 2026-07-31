// Base units (e.g. wei) to a trimmed decimal string. Pure string math, no floats.
export function formatUnits(value: string, decimals: number, maxFractionDigits = 6): string {
  const negative = value.startsWith("-");
  const digits = (negative ? value.slice(1) : value).padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction =
    decimals === 0
      ? ""
      : digits
          .slice(digits.length - decimals, digits.length - decimals + maxFractionDigits)
          .replace(/0+$/, "");
  const body = fraction ? `${whole}.${fraction}` : whole;
  return negative ? `-${body}` : body;
}

// Base units to a full-precision number, for arithmetic (e.g. a USD price).
export function unitsToNumber(value: string, decimals: number): number {
  return Number(formatUnits(value, decimals, decimals));
}
