// Decimal string to base units (wei/lamports/sats). Extra fraction digits are
// truncated, never rounded up. Pure string math, no floats. Shared by the
// background (turning a wire send amount into a TransferRequest) and the UI
// (validating an entered amount against a bigint balance) so both sides parse
// the same input the same way.
export function toBaseUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? trimmed.slice(1) : trimmed).split(".");
  const scaled = `${whole}${fraction.slice(0, decimals).padEnd(decimals, "0")}`;
  const magnitude = BigInt(scaled.replace(/^0+(?=\d)/, "") || "0");
  return negative ? -magnitude : magnitude;
}
