import { describe, expect, it } from "vitest";
import {
  createEvmClient,
  getTbaAddress,
  isTbaDeployed,
  DEFAULT_TBA_IMPLEMENTATION,
  ERC6551_REGISTRY,
  SIMPLE_7702_IMPLEMENTATION,
} from "@openwallet/chain-evm";
import { sepolia } from "viem/chains";
import type { Address } from "viem";

/**
 * Live checks against Sepolia, tier one: **read-only, no key, no funds**.
 *
 * These exist because the most dangerous failure in this codebase is a wrong
 * constant. Every address below is hardcoded, and a wrong one fails silently
 * rather than loudly — a token bound account computed against an
 * implementation that isn't deployed still yields a plausible address, and
 * money sent there is gone. Unit tests can't catch that; only the chain can.
 *
 * Skipped unless `SEPOLIA_RPC_URL` is set, so CI (which has no network policy
 * for third-party RPCs) stays unaffected. Tiers two and three — building a
 * User Operation, and actually sending one — additionally need a bundler URL
 * and a funded key, and are deliberately not in this file.
 */
const RPC_URL = process.env.SEPOLIA_RPC_URL;
const SEPOLIA_CHAIN_ID = 11_155_111;

// An arbitrary collection: the registry computes a token bound account's
// address whether or not that NFT exists, which is the property under test.
const NFT_CONTRACT: Address = "0x0000000000696760E15f265e828DB644A0c242EB";

describe.skipIf(!RPC_URL)("Sepolia · read-only", () => {
  const client = createEvmClient(RPC_URL ?? "", sepolia);

  it.each([
    ["ERC-6551 registry", ERC6551_REGISTRY],
    ["token bound account implementation", DEFAULT_TBA_IMPLEMENTATION],
    ["Simple7702Account implementation", SIMPLE_7702_IMPLEMENTATION],
  ])("has %s deployed", async (_label, address) => {
    const code = await client.getCode({ address });

    expect(code).toBeDefined();
    expect(code).not.toBe("0x");
  });

  it("computes a token bound account address through the real registry", async () => {
    const address = await getTbaAddress(client, {
      chainId: SEPOLIA_CHAIN_ID,
      tokenContract: NFT_CONTRACT,
      tokenId: 1n,
    });

    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("derives the same address every time", async () => {
    const ref = { chainId: SEPOLIA_CHAIN_ID, tokenContract: NFT_CONTRACT, tokenId: 1n };

    const [first, second] = await Promise.all([
      getTbaAddress(client, ref),
      getTbaAddress(client, ref),
    ]);

    expect(first).toBe(second);
  });

  it("derives a different address per token, which is what binds it to the NFT", async () => {
    const base = { chainId: SEPOLIA_CHAIN_ID, tokenContract: NFT_CONTRACT };

    const [one, two] = await Promise.all([
      getTbaAddress(client, { ...base, tokenId: 1n }),
      getTbaAddress(client, { ...base, tokenId: 2n }),
    ]);

    expect(one).not.toBe(two);
  });

  it("reports an unclaimed account as not deployed", async () => {
    // A counterfactual account: the address is real and can receive assets,
    // but no code lives there until someone deploys it.
    const address = await getTbaAddress(client, {
      chainId: SEPOLIA_CHAIN_ID,
      tokenContract: NFT_CONTRACT,
      // An id nobody is realistically using, so this stays true over time.
      tokenId: 987_654_321_987_654_321n,
    });

    await expect(isTbaDeployed(client, address)).resolves.toBe(false);
  });
});
