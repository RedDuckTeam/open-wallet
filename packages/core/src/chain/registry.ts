import type { ChainAdapter } from "./adapter.js";

/**
 * An in-memory lookup of chain adapters keyed by `ChainAdapter.id`, for the
 * chain-agnostic path: iterate registered chains and drive each through the
 * `ChainAdapter` contract without importing any chain package directly. A
 * consumer that needs a chain's concrete types or token operations should
 * instead keep the `ChainAdapter<XxxChainTypes>` its `createXxxAdapter`
 * factory returns — the registry deliberately stores adapters at the
 * all-`unknown` default, so `adapter(id)` hands back only the uniform
 * surface.
 */
export class ChainRegistry {
  readonly #adapters = new Map<string, ChainAdapter>();

  /**
   * Registers `adapter` under its own `id`. Throws on a duplicate id rather
   * than overwriting — the same fail-fast choice `Wallet` makes for coin ids,
   * since a silent overwrite would be a configuration bug, not intent.
   */
  register(adapter: ChainAdapter): void {
    if (this.#adapters.has(adapter.id)) {
      throw new Error(`Duplicate chain adapter id registered: "${adapter.id}"`);
    }
    this.#adapters.set(adapter.id, adapter);
  }

  /** The adapter for `id`, or `undefined` if none is registered. */
  get(id: string): ChainAdapter | undefined {
    return this.#adapters.get(id);
  }

  /** The adapter for `id`; throws if none is registered (the caller asserts it exists). */
  adapter(id: string): ChainAdapter {
    const found = this.#adapters.get(id);
    if (found === undefined) {
      throw new Error(`No chain adapter registered for id: "${id}"`);
    }
    return found;
  }

  /** Whether an adapter is registered for `id`. */
  has(id: string): boolean {
    return this.#adapters.has(id);
  }

  /** The ids of every registered adapter, in insertion order. */
  ids(): string[] {
    return [...this.#adapters.keys()];
  }
}
