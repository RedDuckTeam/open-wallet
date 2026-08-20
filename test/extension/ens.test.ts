import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsService } from "../../apps/extension/src/background/services/settings-service.js";
import type {
  Settings,
  SettingsStorage,
} from "../../apps/extension/src/platform/settings-storage.js";
import { ChainKind } from "../../apps/extension/src/messaging/protocol.js";
import { ENS_NETWORK_ID, NETWORKS } from "../../apps/extension/src/config/networks.js";
import type { EvmNetwork } from "../../apps/extension/src/config/networks.js";

const resolveEnsAddressMock = vi.hoisted(() => vi.fn());

// Only the network-hitting resolver is faked. Everything else — the name
// guard, the address validators, the client cache — stays real, so this tests
// the routing decision rather than a rewrite of it.
vi.mock("@openwallet/chain-evm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@openwallet/chain-evm")>();
  return { ...actual, resolveEnsAddress: resolveEnsAddressMock };
});

const { createChainService } = await import("../../apps/extension/src/background/chains.js");

const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

class FakeStorage implements SettingsStorage {
  saved: Settings | null = null;
  load(): Promise<Partial<Settings> | null> {
    return Promise.resolve(this.saved);
  }
  save(settings: Settings): Promise<void> {
    this.saved = settings;
    return Promise.resolve();
  }
}

function network(id: string): EvmNetwork {
  const found = NETWORKS.find((entry) => entry.id === id);
  if (!found || found.kind !== ChainKind.Evm) throw new Error(`No EVM network "${id}"`);
  return found;
}

const chains = createChainService();
const l1 = network(ENS_NETWORK_ID);

describe("SettingsService.ensNetwork", () => {
  let service: SettingsService;
  beforeEach(async () => {
    service = new SettingsService(new FakeStorage());
    await service.init();
  });

  it("is the L1 network, whatever the active network is", async () => {
    await service.selectNetwork("base");
    expect(service.activeNetwork().id).toBe("base");
    expect(service.ensNetwork()?.id).toBe(ENS_NETWORK_ID);
  });

  it("honours a custom RPC set for that network", async () => {
    await service.setRpc(ENS_NETWORK_ID, "https://my-node.example/eth");
    // Resolution must go through the endpoint the user chose, not the default:
    // the usual reason to set one is that the public node is rate limiting.
    expect(service.ensNetwork()?.rpcUrl).toBe("https://my-node.example/eth");
  });
});

describe("resolveRecipient", () => {
  beforeEach(() => {
    resolveEnsAddressMock.mockReset();
  });

  it("returns a valid address unchanged, without a lookup", async () => {
    const result = await chains.resolveRecipient(network("base"), `  ${VITALIK}  `, l1);
    expect(result).toBe(VITALIK);
    expect(resolveEnsAddressMock).not.toHaveBeenCalled();
  });

  it("resolves a name against L1 while an L2 is active", async () => {
    // The regression this whole change exists for: ENS has no registry on
    // Base, so resolving against the active network used to throw and get
    // swallowed into "not a valid address or ENS name".
    resolveEnsAddressMock.mockResolvedValueOnce(VITALIK);

    const result = await chains.resolveRecipient(network("base"), "vitalik.eth", l1);

    expect(result).toBe(VITALIK);
    const [client] = resolveEnsAddressMock.mock.calls[0] as [{ chain?: { id: number } }];
    expect(client.chain?.id).toBe(l1.chain.id);
  });

  it("looks names up on L1 even when L1 is already the active network", async () => {
    resolveEnsAddressMock.mockResolvedValueOnce(VITALIK);
    await expect(chains.resolveRecipient(l1, "vitalik.eth", l1)).resolves.toBe(VITALIK);
  });

  it("passes an ENSIP-15 normalized name to the resolver", async () => {
    resolveEnsAddressMock.mockResolvedValueOnce(VITALIK);
    await chains.resolveRecipient(network("base"), "VITALIK.eth", l1);
    expect(resolveEnsAddressMock.mock.calls[0]?.[1]).toBe("vitalik.eth");
  });

  it("tries names outside .eth, which ENS also resolves", async () => {
    resolveEnsAddressMock.mockResolvedValueOnce(null);
    await chains.resolveRecipient(network("base"), "example.xyz", l1);
    expect(resolveEnsAddressMock).toHaveBeenCalled();
  });

  it("reports an unregistered name as not found", async () => {
    resolveEnsAddressMock.mockResolvedValueOnce(null);
    await expect(chains.resolveRecipient(network("base"), "nobody.eth", l1)).resolves.toBeNull();
  });

  it("treats un-normalizable input as not a name, without a lookup", async () => {
    // A stray space is a plausible typo, not a resolution failure — it must
    // not surface as an error from deep inside the ENS normalizer.
    await expect(chains.resolveRecipient(network("base"), "bad name.eth", l1)).resolves.toBeNull();
    expect(resolveEnsAddressMock).not.toHaveBeenCalled();
  });

  it("skips the lookup for input with no dot at all", async () => {
    await expect(chains.resolveRecipient(network("base"), "notaname", l1)).resolves.toBeNull();
    expect(resolveEnsAddressMock).not.toHaveBeenCalled();
  });

  it("propagates a registry failure instead of reporting the name as missing", async () => {
    // "The name has no address" and "the wallet couldn't reach the registry"
    // are different answers, and only one of them means the user should give
    // up on the recipient they typed.
    resolveEnsAddressMock.mockRejectedValueOnce(new Error("HTTP request failed"));
    await expect(chains.resolveRecipient(network("base"), "vitalik.eth", l1)).rejects.toThrow(
      "HTTP request failed",
    );
  });

  it("does not resolve names on non-EVM networks", async () => {
    const bitcoin = NETWORKS.find((entry) => entry.kind === ChainKind.Bitcoin);
    if (!bitcoin) throw new Error("expected a Bitcoin network");
    await expect(chains.resolveRecipient(bitcoin, "vitalik.eth", l1)).resolves.toBeNull();
    expect(resolveEnsAddressMock).not.toHaveBeenCalled();
  });

  it("reports names as unresolvable when no L1 network is configured", async () => {
    await expect(chains.resolveRecipient(network("base"), "vitalik.eth", null)).resolves.toBeNull();
    expect(resolveEnsAddressMock).not.toHaveBeenCalled();
  });
});
