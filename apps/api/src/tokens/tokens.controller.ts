import { Controller, Get, Query } from "@nestjs/common";
import {
  SolanaTokenSearchQuery,
  TokenListQuery,
  TokenSearchQuery,
  type SolanaTokenListResponse,
  type TokenListResponse,
} from "@openwallet/api-contract";
import type { z } from "zod";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { TokensService } from "./tokens.service.js";

@Controller("v1/tokens")
export class TokensController {
  constructor(private readonly tokens: TokensService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(TokenListQuery)) query: z.infer<typeof TokenListQuery>,
  ): Promise<TokenListResponse> {
    return { tokens: await this.tokens.list(query.chainId) };
  }

  @Get("search")
  async search(
    @Query(new ZodValidationPipe(TokenSearchQuery)) query: z.infer<typeof TokenSearchQuery>,
  ): Promise<TokenListResponse> {
    return { tokens: await this.tokens.search(query.chainId, query.q, query.limit) };
  }

  @Get("search/solana")
  async searchSolana(
    @Query(new ZodValidationPipe(SolanaTokenSearchQuery))
    query: z.infer<typeof SolanaTokenSearchQuery>,
  ): Promise<SolanaTokenListResponse> {
    return { tokens: await this.tokens.searchSolana(query.q, query.limit) };
  }
}
