import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SwapQuoteResponse } from "@openwallet/api-contract";
import { LifiClient, type SwapQuoteParams } from "@openwallet/lifi-client";
import { JupiterClient, type SolanaSwapQuoteParams } from "@openwallet/jupiter-client";

// Quotes carry a time-sensitive execution tx, so they are not cached: a stale
// route would sign the wrong transaction. Only slow-moving data (tokens) caches.
@Injectable()
export class SwapService {
  constructor(private readonly config: ConfigService) {}

  quote(params: SwapQuoteParams): Promise<SwapQuoteResponse> {
    const client = new LifiClient(this.config.get<string>("LIFI_API_KEY") ?? "");
    return client.quote(params);
  }

  quoteSolana(params: SolanaSwapQuoteParams): Promise<SwapQuoteResponse> {
    return new JupiterClient().quote(params);
  }
}
