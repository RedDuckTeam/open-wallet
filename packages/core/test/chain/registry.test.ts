import { describe, expect, it } from "vitest";
import { ChainRegistry } from "../../src/chain/registry.js";
import type { ChainAdapter } from "../../src/chain/adapter.js";

// A minimal adapter with stubbed operations — the registry only cares about
// `id` and identity, so the send-flow methods never need real behavior here.
function stubAdapter(id: string): ChainAdapter {
  return {
    id,
    isValidAddress: () => true,
    validate: () => undefined,
    buildTransfer: () => Promise.resolve(undefined),
    estimateFees: () => Promise.resolve(undefined),
    sign: (unsigned) => unsigned,
    broadcast: () => Promise.resolve(undefined),
    getNativeBalance: () => Promise.resolve(0n),
    signMessage: (message) => message,
  };
}

describe("ChainRegistry", () => {
  it("registers an adapter and looks it up by id", () => {
    const registry = new ChainRegistry();
    const adapter = stubAdapter("evm");

    registry.register(adapter);

    expect(registry.get("evm")).toBe(adapter);
    expect(registry.adapter("evm")).toBe(adapter);
    expect(registry.has("evm")).toBe(true);
    expect(registry.ids()).toEqual(["evm"]);
  });

  it("throws on a duplicate adapter id instead of overwriting", () => {
    const registry = new ChainRegistry();
    registry.register(stubAdapter("evm"));

    expect(() => registry.register(stubAdapter("evm"))).toThrow(/Duplicate chain adapter id/);
  });

  it("get() returns undefined and adapter() throws for an unknown id", () => {
    const registry = new ChainRegistry();

    expect(registry.get("nope")).toBeUndefined();
    expect(registry.has("nope")).toBe(false);
    expect(() => registry.adapter("nope")).toThrow(/No chain adapter registered/);
  });
});
