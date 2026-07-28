import type { Connection, ConnectionStorage } from "../../platform/connection-storage.js";

// In-memory index of connected origins, write-through to storage. The single
// source of truth for "is this site allowed" and the connected-sites list.
export class ConnectionStore {
  #connections: Record<string, Connection> = {};

  constructor(private readonly storage: ConnectionStorage) {}

  async init(): Promise<void> {
    this.#connections = await this.storage.load();
  }

  isConnected(origin: string): boolean {
    return origin in this.#connections;
  }

  get(origin: string): Connection | undefined {
    return this.#connections[origin];
  }

  // Newest first.
  list(): Connection[] {
    return Object.values(this.#connections).sort((a, b) => b.connectedAt - a.connectedAt);
  }

  get count(): number {
    return Object.keys(this.#connections).length;
  }

  async connect(connection: Connection): Promise<void> {
    this.#connections = { ...this.#connections, [connection.origin]: connection };
    await this.storage.save(this.#connections);
  }

  async disconnect(origin: string): Promise<void> {
    if (!(origin in this.#connections)) return;
    const next = { ...this.#connections };
    delete next[origin];
    this.#connections = next;
    await this.storage.save(this.#connections);
  }

  async disconnectAll(): Promise<void> {
    this.#connections = {};
    await this.storage.save(this.#connections);
  }
}
