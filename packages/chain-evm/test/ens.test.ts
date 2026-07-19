import type { Address, PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

const getEnsAddressMock = vi.hoisted(() => vi.fn());
const getEnsNameMock = vi.hoisted(() => vi.fn());

// Only the network-hitting actions are mocked — `normalize` stays real, so
// the test can prove it's actually applied before resolving.
vi.mock("viem/ens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem/ens")>();
  return { ...actual, getEnsAddress: getEnsAddressMock, getEnsName: getEnsNameMock };
});

const { resolveEnsAddress, lookupEnsName } = await import("../src/ens.js");

const ADDRESS: Address = "0xd2135CfB216b74109775236E36d4b433F1DF507B";

function mockClient(): PublicClient {
  return {} as unknown as PublicClient;
}

describe("resolveEnsAddress", () => {
  it("normalizes the name before resolving", async () => {
    getEnsAddressMock.mockResolvedValueOnce(ADDRESS);
    const client = mockClient();

    const result = await resolveEnsAddress(client, "Vitalik.eth");

    expect(result).toBe(ADDRESS);
    expect(getEnsAddressMock).toHaveBeenCalledWith(client, { name: "vitalik.eth" });
  });

  it("returns null when the name has no address set", async () => {
    getEnsAddressMock.mockResolvedValueOnce(null);
    await expect(resolveEnsAddress(mockClient(), "unregistered.eth")).resolves.toBeNull();
  });
});

describe("lookupEnsName", () => {
  it("reverse-resolves an address to its primary name", async () => {
    getEnsNameMock.mockResolvedValueOnce("vitalik.eth");
    const client = mockClient();

    await expect(lookupEnsName(client, ADDRESS)).resolves.toBe("vitalik.eth");
    expect(getEnsNameMock).toHaveBeenCalledWith(client, { address: ADDRESS });
  });

  it("returns null when the address has no primary name set", async () => {
    getEnsNameMock.mockResolvedValueOnce(null);
    await expect(lookupEnsName(mockClient(), ADDRESS)).resolves.toBeNull();
  });
});
