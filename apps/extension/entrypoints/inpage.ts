import { defineUnlistedScript } from "#imports";
import {
  CONTENT_TO_INPAGE,
  INPAGE_TO_CONTENT,
  RPC_ERROR,
  type EventMessage,
  type RpcReply,
} from "../src/dapp/messages.js";

// The page-facing provider (MAIN world). Speaks EIP-1193 to the dApp and relays
// every request to the content bridge via window.postMessage; announces itself
// via EIP-6963 so wallets don't fight over window.ethereum.

const WALLET_NAME = "OpenWallet";
const WALLET_RDNS = "app.openwallet";
// Inlined so the provider stays self-contained in the page.
const WALLET_ICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDMyIDMyIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHJ4PSI4IiBmaWxsPSIjMzE2M2ZmIi8+PHBhdGggZD0iTTggMTFsNCAxMCA0LTEwIDQgMTAgNC0xMCIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIuNCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+";

type Handler = (args: unknown) => void;

class OpenWalletProvider {
  readonly isOpenWallet = true;
  chainId: string | null = null;
  networkVersion: string | null = null;
  selectedAddress: string | null = null;

  #nextId = 1;
  #pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  #listeners = new Map<string, Set<Handler>>();
  #connected = false;

  constructor() {
    window.addEventListener("message", (event) => this.#onMessage(event));
    // Populate chainId and fire connect once the background answers.
    void this.request({ method: "eth_chainId" }).catch(() => undefined);
    void this.request({ method: "eth_accounts" }).catch(() => undefined);
  }

  request({ method, params }: { method: string; params?: unknown }): Promise<unknown> {
    if (typeof method !== "string" || method.length === 0) {
      return Promise.reject(rpcError(RPC_ERROR.InvalidParams, "'method' is required"));
    }
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      window.postMessage({ channel: INPAGE_TO_CONTENT, id, call: { method, params } }, "*");
    });
  }

  // Event API (EIP-1193).
  on(event: string, handler: Handler): this {
    const set = this.#listeners.get(event) ?? new Set();
    set.add(handler);
    this.#listeners.set(event, set);
    return this;
  }

  removeListener(event: string, handler: Handler): this {
    this.#listeners.get(event)?.delete(handler);
    return this;
  }

  isConnected(): boolean {
    return this.#connected;
  }

  // Legacy shims some dApps still call.
  enable(): Promise<unknown> {
    return this.request({ method: "eth_requestAccounts" });
  }

  #onMessage(event: MessageEvent): void {
    if (event.source !== window) return;
    const data = event.data as (RpcReply | EventMessage) | undefined;
    if (!data || data.channel !== CONTENT_TO_INPAGE) return;

    if ("id" in data) {
      const pending = this.#pending.get(data.id);
      if (!pending) return;
      this.#pending.delete(data.id);
      if (data.error) pending.reject(rpcError(data.error.code, data.error.message));
      else pending.resolve(data.result);
      return;
    }
    this.#onEvent(data.event, data.args);
  }

  #onEvent(event: string, args: unknown): void {
    switch (event) {
      case "chainChanged":
        this.chainId = typeof args === "string" ? args : this.chainId;
        this.networkVersion = this.chainId ? String(parseInt(this.chainId, 16)) : null;
        break;
      case "accountsChanged": {
        const accounts = Array.isArray(args) ? (args as string[]) : [];
        this.selectedAddress = accounts[0] ?? null;
        break;
      }
      case "connect":
        this.#connected = true;
        break;
      case "disconnect":
        this.#connected = false;
        this.selectedAddress = null;
        break;
    }
    this.#emit(event, args);
  }

  #emit(event: string, args: unknown): void {
    for (const handler of this.#listeners.get(event) ?? []) {
      try {
        handler(args);
      } catch {
        // a dApp listener throwing must not break the provider
      }
    }
  }
}

function rpcError(code: number, message: string): Error & { code: number } {
  return Object.assign(new Error(message), { code });
}

// EIP-6963: announce on load and on request, so multi-wallet dApps can discover us.
function announce(provider: OpenWalletProvider): void {
  const info = {
    uuid: crypto.randomUUID(),
    name: WALLET_NAME,
    icon: WALLET_ICON,
    rdns: WALLET_RDNS,
  };
  const detail = Object.freeze({ info, provider });
  const emit = (): void => {
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
  };
  window.addEventListener("eip6963:requestProvider", emit);
  emit();
}

export default defineUnlistedScript(() => {
  const provider = new OpenWalletProvider();
  announce(provider);
  // Also set the legacy global when no other wallet claimed it.
  const win = window as unknown as { ethereum?: unknown };
  if (!win.ethereum) win.ethereum = provider;
});
