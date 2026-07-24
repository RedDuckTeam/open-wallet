// Defensive readers for LI.FI's untrusted JSON responses. They never throw on
// a shape mismatch, returning an empty/zero value instead.
export function record(value: unknown, key: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return {};
  const child = (value as Record<string, unknown>)[key];
  return typeof child === "object" && child !== null ? (child as Record<string, unknown>) : {};
}

export function str(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  return typeof value === "string" ? value : "";
}

export function num(obj: Record<string, unknown>, key: string): number {
  const value = obj[key];
  return typeof value === "number" ? value : 0;
}

// LI.FI amounts are decimal strings; tx fields are hex strings. BigInt reads both.
export function big(obj: Record<string, unknown>, key: string): bigint {
  const value = obj[key];
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  return typeof value === "string" && value ? BigInt(value) : 0n;
}
