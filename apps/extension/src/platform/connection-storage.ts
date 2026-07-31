import { browser } from "wxt/browser";

// A dApp origin the user has connected to. Non-secret; kept separate from the
// vault and from settings so its shape can evolve independently.
export interface Connection {
  readonly origin: string;
  readonly name: string;
  readonly iconUrl: string | null;
  readonly connectedAt: number;
}

export interface ConnectionStorage {
  load(): Promise<Record<string, Connection>>;
  save(connections: Record<string, Connection>): Promise<void>;
}

const KEY = "openwallet.connections";

export class ExtensionConnectionStorage implements ConnectionStorage {
  async load(): Promise<Record<string, Connection>> {
    const result = await browser.storage.local.get(KEY);
    const raw = result[KEY] as unknown;
    return typeof raw === "object" && raw !== null ? (raw as Record<string, Connection>) : {};
  }

  async save(connections: Record<string, Connection>): Promise<void> {
    await browser.storage.local.set({ [KEY]: connections });
  }
}
