import { browser } from "wxt/browser";
import type { SerializedVault, VaultStorage } from "@openwallet/core";

const VAULT_KEY = "openwallet.vault";

// Persists the encrypted vault blob to chrome.storage.local.
export class ExtensionVaultStorage implements VaultStorage {
  async load(): Promise<SerializedVault | null> {
    const result = await browser.storage.local.get(VAULT_KEY);
    const value = result[VAULT_KEY] as SerializedVault | undefined;
    return value ?? null;
  }

  async save(vault: SerializedVault): Promise<void> {
    await browser.storage.local.set({ [VAULT_KEY]: vault });
  }

  async clear(): Promise<void> {
    await browser.storage.local.remove(VAULT_KEY);
  }
}
