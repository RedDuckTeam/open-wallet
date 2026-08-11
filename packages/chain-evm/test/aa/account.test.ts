import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hexToBytes } from "viem";
import type { Address, Hex, PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import {
  SIMPLE_7702_IMPLEMENTATION,
  coinbaseProvider,
  simple7702Provider,
  smartAccountProvider,
  soladyProvider,
} from "../../src/aa/account.js";
import { toOwnerAccount, type EvmSigner } from "../../src/aa/signer.js";
import { SmartAccountKind } from "../../src/aa/types.js";

const PRIVATE_KEY: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ADDRESS: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const signer: EvmSigner = {
  address: ADDRESS,
  publicKey: secp256k1.getPublicKey(hexToBytes(PRIVATE_KEY), true),
  withPrivateKey: (fn) => Promise.resolve(fn(hexToBytes(PRIVATE_KEY))),
};

// Creating a Simple7702 account needs no chain reads — its address is the
// owner's — so an empty client is enough to prove exactly that.
const client = {} as unknown as PublicClient;

describe("simple7702Provider", () => {
  it("keeps the owner's address, which is the entire reason to prefer it", async () => {
    const account = await simple7702Provider().create({ client, owner: toOwnerAccount(signer) });

    await expect(account.getAddress()).resolves.toBe(ADDRESS);
  });

  it("reports the delegation target it actually delegates to", () => {
    const provider = simple7702Provider();

    expect(provider.kind).toBe(SmartAccountKind.Simple7702);
    expect(provider.sharesOwnerAddress).toBe(true);
    expect(provider.implementation).toBe(SIMPLE_7702_IMPLEMENTATION);
  });

  it("targets EntryPoint 0.8, the version EIP-7702 accounts are defined against", async () => {
    const account = await simple7702Provider().create({ client, owner: toOwnerAccount(signer) });

    expect(account.entryPoint.version).toBe("0.8");
  });

  it("honours an overridden implementation, so the reported target can't drift from the real one", async () => {
    const custom: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    const provider = simple7702Provider({ implementation: custom });

    const account = await provider.create({ client, owner: toOwnerAccount(signer) });

    expect(provider.implementation).toBe(custom);
    expect(account.authorization?.address).toBe(custom);
  });
});

describe("counterfactual providers", () => {
  it("declare that their address is not the owner's", () => {
    expect(coinbaseProvider().sharesOwnerAddress).toBe(false);
    expect(soladyProvider().sharesOwnerAddress).toBe(false);
  });

  it("have no delegation target — they deploy through a factory instead", () => {
    expect(coinbaseProvider().implementation).toBeNull();
    expect(soladyProvider().implementation).toBeNull();
  });
});

describe("smartAccountProvider", () => {
  it("resolves every kind, so a persisted settings string always maps to a provider", () => {
    for (const kind of Object.values(SmartAccountKind)) {
      expect(smartAccountProvider(kind).kind).toBe(kind);
    }
  });
});
