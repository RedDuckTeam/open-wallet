import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PriceService } from "../../apps/extension/src/background/adapters/price-service.js";
import type { PriceProvider } from "../../apps/extension/src/background/ports/price-provider.js";

function provider(overrides: Partial<PriceProvider>): PriceProvider {
  return {
    nativeUsd: () => Promise.resolve(null),
    tokensUsd: () => Promise.resolve({}),
    ...overrides,
  };
}

describe("PriceService source ordering", () => {
  it("uses the first source when it returns data", async () => {
    const second = provider({ nativeUsd: vi.fn(() => Promise.resolve(1)) });
    const prices = new PriceService([provider({ nativeUsd: () => Promise.resolve(2000) }), second]);
    expect(await prices.nativeUsd("ethereum")).toBe(2000);
    expect(second.nativeUsd).not.toHaveBeenCalled();
  });

  it("falls through to the next source when the first returns null", async () => {
    const prices = new PriceService([
      provider({ nativeUsd: () => Promise.resolve(null) }),
      provider({ nativeUsd: () => Promise.resolve(2000) }),
    ]);
    expect(await prices.nativeUsd("ethereum")).toBe(2000);
  });

  it("falls through to the next source when the first throws", async () => {
    const prices = new PriceService([
      provider({ nativeUsd: () => Promise.reject(new Error("backend down")) }),
      provider({ nativeUsd: () => Promise.resolve(2000) }),
    ]);
    expect(await prices.nativeUsd("ethereum")).toBe(2000);
  });

  it("falls through for tokens when the first source is empty", async () => {
    const prices = new PriceService([
      provider({ tokensUsd: () => Promise.resolve({}) }),
      provider({ tokensUsd: () => Promise.resolve({ "0xabc": 1 }) }),
    ]);
    expect(await prices.tokensUsd("ethereum", ["0xabc"])).toEqual({ "0xabc": 1 });
  });

  it("returns empty/null when every source fails, never throwing", async () => {
    const prices = new PriceService([
      provider({
        nativeUsd: () => Promise.reject(new Error("primary")),
        tokensUsd: () => Promise.reject(new Error("primary")),
      }),
      provider({
        nativeUsd: () => Promise.reject(new Error("fallback")),
        tokensUsd: () => Promise.reject(new Error("fallback")),
      }),
    ]);
    expect(await prices.nativeUsd("ethereum")).toBeNull();
    expect(await prices.tokensUsd("ethereum", ["0xabc"])).toEqual({});
  });
});

describe("PriceService caching", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves a cached value within the TTL without calling the source again", async () => {
    const source = provider({ nativeUsd: vi.fn(() => Promise.resolve(2000)) });
    const prices = new PriceService([source]);

    expect(await prices.nativeUsd("ethereum")).toBe(2000);
    expect(await prices.nativeUsd("ethereum")).toBe(2000);
    expect(source.nativeUsd).toHaveBeenCalledTimes(1);
  });

  it("refetches once the TTL has elapsed", async () => {
    const source = provider({
      nativeUsd: vi.fn().mockResolvedValueOnce(2000).mockResolvedValueOnce(2100),
    });
    const prices = new PriceService([source]);

    expect(await prices.nativeUsd("ethereum")).toBe(2000);
    vi.advanceTimersByTime(60_001);
    expect(await prices.nativeUsd("ethereum")).toBe(2100);
    expect(source.nativeUsd).toHaveBeenCalledTimes(2);
  });

  it("serves the last good value (stale-on-error) when a later fetch comes back empty", async () => {
    const source = provider({
      nativeUsd: vi.fn().mockResolvedValueOnce(2000).mockResolvedValueOnce(null),
    });
    const prices = new PriceService([source]);

    expect(await prices.nativeUsd("ethereum")).toBe(2000);
    vi.advanceTimersByTime(60_001);
    expect(await prices.nativeUsd("ethereum")).toBe(2000);
  });

  it("dedupes concurrent in-flight requests for the same key", async () => {
    const source = provider({ nativeUsd: vi.fn(() => Promise.resolve(2000)) });
    const prices = new PriceService([source]);

    const [a, b] = await Promise.all([prices.nativeUsd("ethereum"), prices.nativeUsd("ethereum")]);
    expect(a).toBe(2000);
    expect(b).toBe(2000);
    expect(source.nativeUsd).toHaveBeenCalledTimes(1);
  });
});
