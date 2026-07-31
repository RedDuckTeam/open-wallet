import { beforeEach, describe, expect, it } from "vitest";
import { ConnectionStore } from "../../apps/extension/src/background/dapp/connection-store.js";
import type {
  Connection,
  ConnectionStorage,
} from "../../apps/extension/src/platform/connection-storage.js";

class FakeStorage implements ConnectionStorage {
  data: Record<string, Connection> = {};
  load(): Promise<Record<string, Connection>> {
    return Promise.resolve(this.data);
  }
  save(connections: Record<string, Connection>): Promise<void> {
    this.data = connections;
    return Promise.resolve();
  }
}

function connection(origin: string, connectedAt: number): Connection {
  return { origin, name: origin, iconUrl: null, connectedAt };
}

describe("ConnectionStore", () => {
  let storage: FakeStorage;
  let store: ConnectionStore;

  beforeEach(async () => {
    storage = new FakeStorage();
    store = new ConnectionStore(storage);
    await store.init();
  });

  it("connects, checks, and persists", async () => {
    expect(store.isConnected("https://app.uniswap.org")).toBe(false);
    await store.connect(connection("https://app.uniswap.org", 1));
    expect(store.isConnected("https://app.uniswap.org")).toBe(true);
    expect(store.count).toBe(1);
    expect(storage.data["https://app.uniswap.org"]).toBeDefined();
  });

  it("lists newest first", async () => {
    await store.connect(connection("https://a.com", 1));
    await store.connect(connection("https://b.com", 3));
    await store.connect(connection("https://c.com", 2));
    expect(store.list().map((c) => c.origin)).toEqual([
      "https://b.com",
      "https://c.com",
      "https://a.com",
    ]);
  });

  it("disconnects one and all", async () => {
    await store.connect(connection("https://a.com", 1));
    await store.connect(connection("https://b.com", 2));
    await store.disconnect("https://a.com");
    expect(store.isConnected("https://a.com")).toBe(false);
    expect(store.isConnected("https://b.com")).toBe(true);
    await store.disconnectAll();
    expect(store.count).toBe(0);
    expect(storage.data).toEqual({});
  });

  it("rehydrates from storage on init", async () => {
    storage.data = { "https://x.com": connection("https://x.com", 9) };
    const fresh = new ConnectionStore(storage);
    await fresh.init();
    expect(fresh.isConnected("https://x.com")).toBe(true);
  });
});
