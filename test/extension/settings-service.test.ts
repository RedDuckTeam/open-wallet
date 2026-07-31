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
