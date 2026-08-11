import type { NftInfo } from "@openwallet/api-contract";

export interface NftPage {
  readonly nfts: NftInfo[];
  /** Opaque cursor for the next page, or null at the end. Passed back verbatim by the client. */
  readonly nextCursor: string | null;
}

/**
 * A source that can answer "what does this address own".
 *
 * A port rather than a hardcoded vendor, for the same reason
 * `chain-bitcoin/src/providers.ts` is one: which indexer a deployment trusts
 * is an operational choice, and this is the one capability in the whole API
 * with a genuinely keyless alternative. Anyone self-hosting picks; nothing
 * above this line knows which one answered.
 *
 * Note that this is *not* an RPC concern. The API has never made a JSON-RPC
 * call — RPC lives entirely in the extension — and an NFT indexer is a plain
 * keyed (or keyless) HTTP API, the same category as CoinGecko and LI.FI.
 * Adding one here doesn't turn the backend into a node client.
 */
export interface NftIndexer {
  /** Stable id, reported in logs and config (`NFT_INDEXER`). */
  readonly id: string;
  supportsChain(chainId: number): boolean;
  fetchNfts(chainId: number, owner: string, limit: number, cursor?: string): Promise<NftPage>;
}
