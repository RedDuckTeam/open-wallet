// Decimal string to base units (wei/lamports/sats). Extra fraction digits are
// truncated, never rounded up. Pure string math, no floats. Shared by the
// background (turning a wire send amount into a TransferRequest) and the UI
// (validating an entered amount against a bigint balance) so both sides parse
// the same input the same way.
export function toBaseUnits(value: string, decimals: number): bigint {
  // Numeric keyboards and habit insert the locale's separator, which in much
  // of the world is a comma. Treating it as the decimal point here means
  // "0,5" is half a coin everywhere the amount is parsed, instead of a
  // confusing validation error.
  const trimmed = value.trim().replace(",", ".");
  const negative = trimmed.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? trimmed.slice(1) : trimmed).split(".");
  const scaled = `${whole}${fraction.slice(0, decimals).padEnd(decimals, "0")}`;
  const magnitude = BigInt(scaled.replace(/^0+(?=\d)/, "") || "0");
  return negative ? -magnitude : magnitude;
}
