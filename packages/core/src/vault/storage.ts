import type { SerializedVault, VaultStorage } from "./types.js";

/** Reference implementation — for tests, and as the template a real platform adapter follows. */
export class InMemoryVaultStorage implements VaultStorage {
  #data: SerializedVault | null = null;

  load(): Promise<SerializedVault | null> {
    return Promise.resolve(this.#data);
  }

  save(vault: SerializedVault): Promise<void> {
    this.#data = vault;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.#data = null;
    return Promise.resolve();
  }
}
