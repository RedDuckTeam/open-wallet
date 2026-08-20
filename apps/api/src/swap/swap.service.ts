import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SolanaSwapBuildResponse, SwapQuoteResponse } from "@openwallet/api-contract";
import { LifiClient, type SwapQuoteParams } from "@openwallet/lifi-client";
import { JupiterClient, type SolanaSwapQuoteParams } from "@openwallet/jupiter-client";

// Quotes carry a time-sensitive route, so they are not cached: a stale route
// would sign the wrong swap. Only slow-moving data (tokens) caches.
@Injectable()
export class SwapService {
  constructor(private readonly config: ConfigService) {}

  quote(params: SwapQuoteParams): Promise<SwapQuoteResponse> {
    const client = new LifiClient(this.config.get<string>("LIFI_API_KEY") ?? "");
    return client.quote(params);
  }

  quoteSolana(params: SolanaSwapQuoteParams): Promise<SwapQuoteResponse> {
    return this.#jupiter().quote(params);
  }

  /**
   * Turns a previously quoted route into a signable transaction. Split from
   * quoting because a Solana transaction embeds a recent blockhash and dies
   * with it about a minute later — it has to be built at the moment the user
   * confirms, not while they are still reading the quote.
   */
  async buildSolana(
    route: Record<string, unknown>,
    userPublicKey: string,
  ): Promise<SolanaSwapBuildResponse> {
    const transactionBase64 = await this.#jupiter().buildSwapTransaction(route, userPublicKey);
    return { transactionBase64 };
  }

  #jupiter(): JupiterClient {
    return new JupiterClient(this.config.get<string>("JUPITER_API_KEY") ?? "");
  }
}
