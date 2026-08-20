import { Controller, Get, Query } from "@nestjs/common";
import { NftListQuery, type NftListResponse } from "@openwallet/api-contract";
import type { z } from "zod";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { NftsService } from "./nfts.service.js";

@Controller("v1/nfts")
export class NftsController {
  constructor(private readonly nfts: NftsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(NftListQuery)) query: z.infer<typeof NftListQuery>,
  ): Promise<NftListResponse> {
    return this.nfts.list(query.chainId, query.owner, query.limit, query.cursor);
  }
}
