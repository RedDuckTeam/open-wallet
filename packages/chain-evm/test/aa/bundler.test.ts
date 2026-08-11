import type { PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { createBundler } from "../../src/aa/bundler.js";

const client = { chain: undefined } as unknown as PublicClient;
const URL = "https://bundler.example/rpc";

describe("createBundler", () => {
  it("requests no sponsorship when no paymaster is configured", () => {
    const bundler = createBundler(client, { url: URL });

    // Self-funded is the default on purpose: silently sponsoring would mean
    // silently sending the operation to a third party for approval.
    expect(bundler.paymaster).toBeUndefined();
    expect(bundler.paymasterContext).toBeUndefined();
  });

  it("uses the bundler's own pm_* methods when the paymaster is `true`", () => {
    const bundler = createBundler(client, { url: URL, paymasterUrl: true });

    expect(bundler.paymaster).toBe(true);
  });

  it("builds a separate paymaster client when given its own URL", () => {
    const bundler = createBundler(client, {
      url: URL,
      paymasterUrl: "https://paymaster.example/rpc",
    });

    expect(bundler.paymaster).toBeTypeOf("object");
  });

  it("forwards the opaque paymaster context that ERC-7677 leaves provider-defined", () => {
    const context = { policyId: "sponsor-everything" };

    const bundler = createBundler(client, {
      url: URL,
      paymasterUrl: true,
      paymasterContext: context,
    });

    expect(bundler.paymasterContext).toBe(context);
  });
});
