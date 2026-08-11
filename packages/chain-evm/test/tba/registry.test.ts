import { decodeFunctionData, parseAbi, type Address, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TBA_IMPLEMENTATION,
  DEFAULT_TBA_SALT,
  ERC6551_REGISTRY,
  encodeCreateTbaAccount,
  getTbaAddress,
  isTbaDeployed,
} from "../../src/tba/registry.js";
import { encodeTbaExecute } from "../../src/tba/execute.js";

const NFT: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const TBA: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const REGISTRY_ABI = parseAbi([
  "function createAccount(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId) returns (address)",
]);
const ACCOUNT_ABI = parseAbi([
  "function execute(address to, uint256 value, bytes data, uint8 operation) payable returns (bytes)",
]);

describe("ERC6551_REGISTRY", () => {
  it("is the address the standard mandates on every chain", () => {
    // Not configurable on purpose: a different registry computes different
    // account addresses, which nobody else would agree with.
    expect(ERC6551_REGISTRY).toBe("0x000000006551c19487814612e58FE06813775758");
  });
});

describe("getTbaAddress", () => {
  it("asks the canonical registry instead of re-deriving CREATE2 locally", async () => {
    const readContract = vi.fn().mockResolvedValue(TBA);

    const address = await getTbaAddress({ readContract } as unknown as PublicClient, {
      chainId: 8453,
      tokenContract: NFT,
      tokenId: 42n,
    });

    expect(address).toBe(TBA);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ERC6551_REGISTRY,
        functionName: "account",
        args: [DEFAULT_TBA_IMPLEMENTATION, DEFAULT_TBA_SALT, 8453n, NFT, 42n],
      }),
    );
  });

  it("passes a caller's implementation and salt through — they change which account it is", async () => {
    const readContract = vi.fn().mockResolvedValue(TBA);
    const implementation: Address = "0x1111111111111111111111111111111111111111";
    const salt = `0x${"11".repeat(32)}` as const;

    await getTbaAddress({ readContract } as unknown as PublicClient, {
      chainId: 1,
      tokenContract: NFT,
      tokenId: 1n,
      implementation,
      salt,
    });

    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ args: [implementation, salt, 1n, NFT, 1n] }),
    );
  });
});

describe("isTbaDeployed", () => {
  it("is false for a counterfactual account that can still receive assets", async () => {
    const getCode = vi.fn().mockResolvedValue("0x");

    await expect(isTbaDeployed({ getCode } as unknown as PublicClient, TBA)).resolves.toBe(false);
  });

  it("is true once code exists", async () => {
    const getCode = vi.fn().mockResolvedValue("0x6080604052");

    await expect(isTbaDeployed({ getCode } as unknown as PublicClient, TBA)).resolves.toBe(true);
  });
});

describe("encodeCreateTbaAccount", () => {
  it("encodes the registry deployment for the bound token", () => {
    const data = encodeCreateTbaAccount({ chainId: 1, tokenContract: NFT, tokenId: 9n });

    expect(decodeFunctionData({ abi: REGISTRY_ABI, data })).toEqual({
      functionName: "createAccount",
      args: [DEFAULT_TBA_IMPLEMENTATION, DEFAULT_TBA_SALT, 1n, NFT, 9n],
    });
  });
});

describe("encodeTbaExecute", () => {
  it("always sends operation 0 (CALL)", () => {
    const data = encodeTbaExecute({ to: NFT, value: 1n, data: "0xabcd" });

    // DELEGATECALL from an account holding assets hands its storage to
    // arbitrary code; this wallet never offers it.
    expect(decodeFunctionData({ abi: ACCOUNT_ABI, data })).toEqual({
      functionName: "execute",
      args: [NFT, 1n, "0xabcd", 0],
    });
  });

  it("defaults to a zero-value call with empty calldata", () => {
    const data = encodeTbaExecute({ to: NFT });

    expect(decodeFunctionData({ abi: ACCOUNT_ABI, data }).args).toEqual([NFT, 0n, "0x", 0]);
  });
});
