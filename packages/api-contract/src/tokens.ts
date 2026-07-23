import { z } from "zod";

// A swappable token. `address` is the lowercased contract address; native uses
// the zero address. `logoUrl` is null when the source has no logo.
export const TokenInfo = z.object({
  chainId: z.number().int(),
  address: z.string(),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number().int(),
  logoUrl: z.string().nullable(),
});
export type TokenInfo = z.infer<typeof TokenInfo>;

export const TokenListResponse = z.object({ tokens: z.array(TokenInfo) });
export type TokenListResponse = z.infer<typeof TokenListResponse>;

// Query strings arrive as strings; coerce numerics at the boundary.
export const TokenListQuery = z.object({
  chainId: z.coerce.number().int().positive(),
});

export const TokenSearchQuery = z.object({
  chainId: z.coerce.number().int().positive(),
  q: z.string().default(""),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

// A Solana token (by mint) — no chainId, Solana mainnet is Jupiter's only chain.
export const SolanaTokenInfo = z.object({
  address: z.string(),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number().int(),
  logoUrl: z.string().nullable(),
});
export type SolanaTokenInfo = z.infer<typeof SolanaTokenInfo>;

export const SolanaTokenListResponse = z.object({ tokens: z.array(SolanaTokenInfo) });
export type SolanaTokenListResponse = z.infer<typeof SolanaTokenListResponse>;

export const SolanaTokenSearchQuery = z.object({
  q: z.string().default(""),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
