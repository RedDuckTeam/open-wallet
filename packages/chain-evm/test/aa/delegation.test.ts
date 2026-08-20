import type { Address, Hex, PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  DELEGATION_PREFIX,
  getDelegation,
  isDelegatedTo,
  parseDelegation,
} from "../../src/aa/delegation.js";

const EOA: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const IMPLEMENTATION: Address = "0xe6Cae83BdE06E4c305530e199D7217f42808555B";
const DELEGATED_CODE: Hex = `${DELEGATION_PREFIX}e6cae83bde06e4c305530e199d7217f42808555b`;

function mockClient(getCode: ReturnType<typeof vi.fn>): PublicClient {
  return { getCode } as unknown as PublicClient;
}

describe("parseDelegation", () => {
  it("extracts the implementation from a well-formed delegation indicator", () => {
    expect(parseDelegation(DELEGATED_CODE)).toBe(IMPLEMENTATION);
  });

  it("returns a checksummed address even though the on-chain indicator carries no checksum", () => {
    // The whole point: a caller comparing against a checksummed constant
    // must not see a false mismatch just because the chain stores lowercase.
    expect(parseDelegation(DELEGATED_CODE)).toBe(IMPLEMENTATION);
    expect(parseDelegation(DELEGATED_CODE)).not.toBe(IMPLEMENTATION.toLowerCase());
  });

  it("treats an account with no code as not delegated", () => {
    expect(parseDelegation("0x")).toBeNull();
    expect(parseDelegation(undefined)).toBeNull();
    expect(parseDelegation(null)).toBeNull();
  });

  it("rejects code of the wrong length, even with the right prefix", () => {
    // One byte short and one byte long: both would otherwise slice into
    // something that looks like an address.
    expect(
      parseDelegation(`${DELEGATION_PREFIX}e6cae83bde06e4c305530e199d7217f42808555b00`),
    ).toBeNull();
    expect(parseDelegation(`${DELEGATION_PREFIX}e6cae83bde06e4c305530e199d7217f428085`)).toBeNull();
  });

  it("rejects a 23-byte code that isn't the EIP-7702 prefix", () => {
    expect(parseDelegation("0xef0200e6cae83bde06e4c305530e199d7217f42808555b")).toBeNull();
    expect(parseDelegation("0x600060e6cae83bde06e4c305530e199d7217f42808555b")).toBeNull();
  });

  it("rejects ordinary contract bytecode", () => {
    expect(parseDelegation("0x6080604052348015600f57600080fd5b50")).toBeNull();
  });
});

describe("getDelegation", () => {
  it("reads the account's code and returns the implementation", async () => {
    const getCode = vi.fn().mockResolvedValue(DELEGATED_CODE);

    await expect(getDelegation(mockClient(getCode), EOA)).resolves.toBe(IMPLEMENTATION);
    expect(getCode).toHaveBeenCalledWith({ address: EOA });
  });

  it("returns null for a plain EOA", async () => {
    const getCode = vi.fn().mockResolvedValue(undefined);

    await expect(getDelegation(mockClient(getCode), EOA)).resolves.toBeNull();
  });
});

describe("isDelegatedTo", () => {
  it("matches regardless of the casing the chain returned", async () => {
    const getCode = vi.fn().mockResolvedValue(DELEGATED_CODE);

    await expect(
      isDelegatedTo(mockClient(getCode), EOA, IMPLEMENTATION.toLowerCase() as Address),
    ).resolves.toBe(true);
  });

  it("is false when the account delegates somewhere else", async () => {
    const getCode = vi
      .fn()
      .mockResolvedValue(`${DELEGATION_PREFIX}70997970c51812dc3a010c7d01b50e0d17dc79c8`);

    await expect(isDelegatedTo(mockClient(getCode), EOA, IMPLEMENTATION)).resolves.toBe(false);
  });

  it("is false when the account has no delegation at all", async () => {
    const getCode = vi.fn().mockResolvedValue("0x");

    await expect(isDelegatedTo(mockClient(getCode), EOA, IMPLEMENTATION)).resolves.toBe(false);
  });
});
