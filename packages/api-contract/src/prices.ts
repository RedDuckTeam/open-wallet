import { z } from "zod";

// Native prices by CoinGecko id. `ids` is comma-separated; the map keys them.
export const NativePriceQuery = z.object({
  ids: z.string().min(1),
});

export const NativePriceResponse = z.object({
  prices: z.record(z.string(), z.number()),
});
export type NativePriceResponse = z.infer<typeof NativePriceResponse>;

// Token prices by contract address on a CoinGecko platform (e.g. "ethereum").
export const TokenPriceQuery = z.object({
  platform: z.string().min(1),
  addresses: z.string().min(1),
});

// Keys are lowercased addresses.
export const TokenPriceResponse = z.object({
  prices: z.record(z.string(), z.number()),
});
export type TokenPriceResponse = z.infer<typeof TokenPriceResponse>;
