import { beforeEach, describe, expect, it } from "vitest";
import { SettingsService } from "../../apps/extension/src/background/services/settings-service.js";
import type {
  Settings,
  SettingsStorage,
} from "../../apps/extension/src/platform/settings-storage.js";
import { hdAccountId, importedAccountId } from "../../apps/extension/src/background/account-id.js";
import { ChainKind } from "../../apps/extension/src/messaging/protocol.js";

/** In-memory stand-in for the chrome.storage-backed `SettingsStorage`. */
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

async function freshService(): Promise<SettingsService> {
  const service = new SettingsService(new FakeStorage());
  await service.init();
  return service;
}

describe("SettingsService active account", () => {
  let service: SettingsService;
  beforeEach(async () => {
    service = await freshService();
  });

  it("addAccount reveals the next HD index and makes it active", async () => {
    const index = await service.addAccount();
    expect(index).toBe(1);
    expect(service.accountCount).toBe(2);
    expect(service.activeAccountId).toBe(hdAccountId(1));
  });

  it("refuses to hide the active account but hides others", async () => {
    await service.addAccount(); // active is now hd:1
    await service.hideAccount(hdAccountId(1)); // active — refused
    expect(service.isAccountHidden(hdAccountId(1))).toBe(false);

    await service.hideAccount(hdAccountId(0));
    expect(service.isAccountHidden(hdAccountId(0))).toBe(true);
    await service.unhideAccount(hdAccountId(0));
    expect(service.isAccountHidden(hdAccountId(0))).toBe(false);
  });
});

describe("SettingsService cross-kind reset", () => {
  it("drops an imported account when switching to a different chain family", async () => {
    const service = await freshService();
    const importedEvm = importedAccountId(ChainKind.Evm, "0ximported");
    await service.selectAccount(importedEvm);
    expect(service.activeAccountId).toBe(importedEvm);

    await service.selectNetwork("solana"); // different family → unrepresentable
    expect(service.activeAccountId).toBe(hdAccountId(0));
  });

  it("keeps an imported account when switching within its chain family", async () => {
    const service = await freshService();
    const importedEvm = importedAccountId(ChainKind.Evm, "0ximported");
    await service.selectAccount(importedEvm);

    await service.selectNetwork("base"); // still EVM
    expect(service.activeAccountId).toBe(importedEvm);
  });

  it("leaves an HD account untouched across any network switch", async () => {
    const service = await freshService();
    await service.selectNetwork("solana");
    expect(service.activeAccountId).toBe(hdAccountId(0));
  });
});

describe("SettingsService testnet mode", () => {
  it("is off by default and shows only mainnets", async () => {
    const service = await freshService();
    expect(service.testnetMode).toBe(false);
    const visible = service.visibleNetworks();
    expect(visible.length).toBeGreaterThan(0);
    for (const network of visible) {
      expect(network.testnet ?? false).toBe(false);
    }
  });

  it("shows only testnets when on and moves activation off a hidden network", async () => {
    const service = await freshService();
    expect(service.activeNetwork().id).toBe("ethereum");

    await service.setTestnetMode(true);
    expect(service.activeNetwork().id).toBe("sepolia");
    for (const network of service.visibleNetworks()) {
      expect(network.testnet).toBe(true);
    }

    await service.setTestnetMode(false);
    expect(service.activeNetwork().id).toBe("ethereum");
  });

  it("keeps a still-visible active network across a redundant toggle", async () => {
    const service = await freshService();
    await service.setTestnetMode(true);
    await service.selectNetwork("bitcoin-testnet");
    await service.setTestnetMode(true); // no-op — must not touch activation
    expect(service.activeNetwork().id).toBe("bitcoin-testnet");
  });

  it("keeps a custom network visible in both modes", async () => {
    const service = await freshService();
    const id = await service.addNetwork({
      name: "Anvil",
      chainId: 31_337,
      rpcUrl: "http://127.0.0.1:8545",
      symbol: "ETH",
    });
    await service.setTestnetMode(true);
    expect(service.visibleNetworks().some((network) => network.id === id)).toBe(true);
    // ENS keeps resolving through the hidden L1.
    expect(service.ensNetwork()?.id).toBe("ethereum");
  });

  it("heals a stored active network the current mode hides", async () => {
    // Settings written before testnet mode existed default to Sepolia.
    const storage = new FakeStorage();
    const seed = new SettingsService(storage);
    await seed.init();
    storage.saved = { ...storage.saved!, activeNetworkId: "sepolia", testnetMode: false };

    const service = new SettingsService(storage);
    await service.init();
    expect(service.activeNetwork().id).toBe("ethereum");
  });
});

describe("SettingsService slippage", () => {
  it("defaults to the policy default and persists an update", async () => {
    const storage = new FakeStorage();
    const service = new SettingsService(storage);
    await service.init();

    expect(service.slippagePct).toBe(0.5);

    await service.setSlippagePct(1);
    expect(service.slippagePct).toBe(1);
    // Written through, so the choice survives a worker restart.
    expect(storage.saved?.slippagePct).toBe(1);
  });
});
