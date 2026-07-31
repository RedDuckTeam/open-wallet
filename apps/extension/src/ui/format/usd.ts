const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatUsd(value: number): string {
  return USD.format(value);
}
