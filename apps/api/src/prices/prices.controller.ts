import { Controller, Get, Query } from "@nestjs/common";
import {
  NativePriceQuery,
  TokenPriceQuery,
  type NativePriceResponse,
  type TokenPriceResponse,
} from "@openwallet/api-contract";
import type { z } from "zod";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { PricesService } from "./prices.service.js";

// Comma-separated list param -> trimmed, de-duped, non-empty entries.
function splitCsv(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

@Controller("v1/prices")
export class PricesController {
  constructor(private readonly prices: PricesService) {}

  @Get("native")
  async native(
    @Query(new ZodValidationPipe(NativePriceQuery)) query: z.infer<typeof NativePriceQuery>,
  ): Promise<NativePriceResponse> {
    return { prices: await this.prices.native(splitCsv(query.ids)) };
  }

  @Get("tokens")
  async tokens(
    @Query(new ZodValidationPipe(TokenPriceQuery)) query: z.infer<typeof TokenPriceQuery>,
  ): Promise<TokenPriceResponse> {
    return { prices: await this.prices.tokens(query.platform, splitCsv(query.addresses)) };
  }
}
