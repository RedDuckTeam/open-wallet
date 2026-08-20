import { Module } from "@nestjs/common";
import { NftsController } from "./nfts.controller.js";
import { NftsService } from "./nfts.service.js";

@Module({
  controllers: [NftsController],
  providers: [NftsService],
})
export class NftsModule {}
