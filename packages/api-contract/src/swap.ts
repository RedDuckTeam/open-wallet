import { z } from "zod";

// The signed tx a swap needs. Amounts are decimal base-unit strings (JSON has
// no bigint); the extension parses them back to bigint to sign.
export const SwapTxData = z.object({
  to: z.string(),
  data: z.string(),
  value: z.string(),
  gasLimit: z.string().nullable(),
});
export type SwapTxData = z.infer<typeof SwapTxData>;

// ERC-20 approval the router needs before the swap; null for native input.
export const SwapApprovalData = z.object({
  token: z.string(),
  spender: z.string(),
  amount: z.string(),
});
export type SwapApprovalData = z.infer<typeof SwapApprovalData>;

export const EvmSwapExecutionData = z.object({
  kind: z.literal("evm"),
  swapTx: SwapTxData,
  approval: SwapApprovalData.nullable(),
});
export type EvmSwapExecutionData = z.infer<typeof EvmSwapExecutionData>;

// A ready-to-sign Solana transaction (base64), already built by the
// aggregator — no separate approval step, SPL allowances don't exist.
export const SolanaSwapExecutionData = z.object({
  kind: z.literal("solana"),
  transactionBase64: z.string(),
});
export type SolanaSwapExecutionData = z.infer<typeof SolanaSwapExecutionData>;

// Discriminated on `kind` rather than one execution shape both chain
// families share: EVM's is a call to sign (+ an optional prior approval),
// Solana's is a whole transaction the aggregator already built.
export const SwapExecutionData = z.discriminatedUnion("kind", [
  EvmSwapExecutionData,
  SolanaSwapExecutionData,
]);
export type SwapExecutionData = z.infer<typeof SwapExecutionData>;

// A same-chain swap quote: display fields plus the ready-to-sign execution, so
// the extension holds no aggregator-specific parsing.
export const SwapQuoteResponse = z.object({
  fromSymbol: z.string(),
  toSymbol: z.string(),
  fromAmount: z.string(),
  toAmount: z.string(),
  toAmountMin: z.string(),
  fromDecimals: z.number().int(),
  toDecimals: z.number().int(),
  tool: z.string(),
  gasUsd: z.number().nullable(),
  execution: SwapExecutionData,
});
export type SwapQuoteResponse = z.infer<typeof SwapQuoteResponse>;

export const SwapQuoteQuery = z.object({
  chainId: z.coerce.number().int().positive(),
  fromAddress: z.string(),
  fromToken: z.string(),
  toToken: z.string(),
  fromAmount: z.string(),
  slippage: z.coerce.number().positive().max(1).default(0.005),
});

// Solana has no EVM-style chain id — one chain (mainnet) per Jupiter instance.
export const SolanaSwapQuoteQuery = z.object({
  fromAddress: z.string(),
  fromToken: z.string(),
  toToken: z.string(),
  fromAmount: z.string(),
  slippage: z.coerce.number().positive().max(1).default(0.005),
});
