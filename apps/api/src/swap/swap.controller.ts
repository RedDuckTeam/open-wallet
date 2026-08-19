import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import {
  SolanaSwapBuildRequest,
  SolanaSwapQuoteQuery,
  SwapQuoteQuery,
  type SolanaSwapBuildResponse,
  type SwapQuoteResponse,
} from "@openwallet/api-contract";
import type { z } from "zod";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { SwapService } from "./swap.service.js";

@Controller("v1/swap")
export class SwapController {
  constructor(private readonly swap: SwapService) {}

  @Get("quote")
  quote(
    @Query(new ZodValidationPipe(SwapQuoteQuery)) query: z.infer<typeof SwapQuoteQuery>,
  ): Promise<SwapQuoteResponse> {
    return this.swap.quote(query);
  }

  @Get("quote/solana")
  quoteSolana(
    @Query(new ZodValidationPipe(SolanaSwapQuoteQuery))
    query: z.infer<typeof SolanaSwapQuoteQuery>,
  ): Promise<SwapQuoteResponse> {
    return this.swap.quoteSolana(query);
  }

  // POST rather than GET: the route object is arbitrary aggregator JSON and
  // does not survive a query string.
  @Post("build/solana")
  buildSolana(
    @Body(new ZodValidationPipe(SolanaSwapBuildRequest))
    body: z.infer<typeof SolanaSwapBuildRequest>,
  ): Promise<SolanaSwapBuildResponse> {
    return this.swap.buildSolana(body.route, body.userPublicKey);
  }
}
