import type { Cache } from "cache-manager";

// Read-through cache: return the cached value or load, store (with a per-entry
// TTL in ms), and return it. A throwing loader is not cached, so a rate-limited
// upstream is retried on the next request rather than caching a failure.
export async function cached<T>(
  cache: Cache,
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = await cache.get<T>(key);
  if (hit !== undefined && hit !== null) return hit;
  const value = await loader();
  await cache.set(key, value, ttlMs);
  return value;
}
