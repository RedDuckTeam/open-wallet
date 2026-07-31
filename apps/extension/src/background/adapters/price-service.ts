import type { PriceProvider } from "../ports/price-provider.js";

const TTL_MS = 60_000;

interface Entry {
  readonly value: unknown;
  readonly at: number;
}

/**
 * The one price-fetching policy: try each source in order (first non-null/
 * non-empty result wins, a source's own error or empty result just moves on
 * to the next), then cache the winning value for a short TTL with in-flight
 * dedup and stale-on-error — a rate-limited (empty) round serves the last
 * good value instead of flickering the UI to "no price."
 *
 * This used to be three stacked decorator classes (cache wrapping fallback
 * wrapping backend/CoinGecko); collapsed into one class since all three were
 * really expressing a single policy over an ordered list of sources.
 */
export class PriceService implements PriceProvider {
  #cache = new Map<string, Entry>();
  #inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly sources: readonly PriceProvider[]) {}

  nativeUsd(coingeckoId: string): Promise<number | null> {
    const isEmpty = (value: number | null): boolean => value === null;
    return this.#cached(
      `n:${coingeckoId}`,
      () => this.#first((source) => source.nativeUsd(coingeckoId), null, isEmpty),
      isEmpty,
    );
  }

  tokensUsd(platform: string, addresses: readonly string[]): Promise<Record<string, number>> {
    if (addresses.length === 0) return Promise.resolve({});
    const key = `t:${platform}:${[...addresses].sort().join(",")}`;
    const isEmpty = (value: Record<string, number>): boolean => Object.keys(value).length === 0;
    return this.#cached(
      key,
      () => this.#first((source) => source.tokensUsd(platform, addresses), {}, isEmpty),
      isEmpty,
    );
  }

  // Tries each source in order; a source's error or "empty" result just
  // moves on to the next one, so one flaky source can't break USD display.
  async #first<T>(
    call: (source: PriceProvider) => Promise<T>,
    empty: T,
    isEmpty: (value: T) => boolean,
  ): Promise<T> {
    for (const source of this.sources) {
      try {
        const value = await call(source);
        if (!isEmpty(value)) return value;
      } catch {
        // try the next source
      }
    }
    return empty;
  }

  async #cached<T>(
    key: string,
    fetcher: () => Promise<T>,
    isEmpty: (value: T) => boolean,
  ): Promise<T> {
    const hit = this.#cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;

    const existing = this.#inflight.get(key);
    if (existing) return existing as Promise<T>;

    const request = (async (): Promise<T> => {
      try {
        const value = await fetcher();
        if (!isEmpty(value)) {
          this.#cache.set(key, { value, at: Date.now() });
          return value;
        }
        // Failed/empty: serve the last good value if we have one.
        return hit ? (hit.value as T) : value;
      } finally {
        this.#inflight.delete(key);
      }
    })();

    this.#inflight.set(key, request);
    return request;
  }
}
