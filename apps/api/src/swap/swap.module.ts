import { Module } from "@nestjs/common";
import { SwapController } from "./swap.controller.js";
import { SwapService } from "./swap.service.js";

@Module({
  controllers: [SwapController],
  providers: [SwapService],
})
export class SwapModule {}
