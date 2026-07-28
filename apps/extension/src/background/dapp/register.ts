import { browser } from "wxt/browser";
import type { ActiveSiteView } from "../../messaging/protocol.js";
import { DAPP_RUNTIME, RPC_ERROR, type RuntimeRpc } from "../../dapp/messages.js";
import { ExtensionConnectionStorage } from "../../platform/connection-storage.js";
import { Approvals } from "./approvals.js";
import { ConnectionStore } from "./connection-store.js";
import { createProviderService, type EmitEvent, type ProviderService } from "./provider-service.js";
import type { SettingsService } from "../services/settings-service.js";
import type { WalletService } from "../services/wallet-service.js";

export interface DappModule {
  readonly provider: ProviderService;
  readonly connections: ConnectionStore;
  readonly approvals: Approvals;
  activeSite(): Promise<ActiveSiteView>;
}

// Wires the dApp provider to the browser: listens for RPC from content scripts,
// tracks which tabs each origin owns (so events reach them), and answers the
// popup's active-site query. The one place the dApp layer touches `browser`.
export function registerDapp(deps: {
  wallet: WalletService;
  settings: SettingsService;
}): DappModule {
  const connections = new ConnectionStore(new ExtensionConnectionStorage());
  void connections.init();
  const approvals = new Approvals();
  const tabsByOrigin = new Map<string, Set<number>>();

  const emit: EmitEvent = (event, args, origin) => {
    const origins = origin ? [origin] : connections.list().map((c) => c.origin);
    for (const target of origins) {
      if (!connections.isConnected(target)) continue;
      for (const tabId of tabsByOrigin.get(target) ?? []) {
        void browser.tabs
          .sendMessage(tabId, { [DAPP_RUNTIME]: true, kind: "event", event, args })
          .catch(() => undefined);
      }
    }
  };

  const provider = createProviderService({ ...deps, connections, approvals, emit });

  browser.runtime.onMessage.addListener((message, sender) => {
    const rpc = message as Partial<RuntimeRpc> | undefined;
    if (!rpc || rpc[DAPP_RUNTIME] !== true || rpc.kind !== "rpc" || !rpc.call) return;

    const origin = originOf(sender);
    if (!origin)
      return Promise.resolve({ error: { code: RPC_ERROR.Internal, message: "No origin" } });

    const tabId = sender.tab?.id;
    if (typeof tabId === "number") {
      const set = tabsByOrigin.get(origin) ?? new Set<number>();
      set.add(tabId);
      tabsByOrigin.set(origin, set);
    }
    const context = {
      origin,
      name: sender.tab?.title || hostOf(origin),
      iconUrl: sender.tab?.favIconUrl ?? null,
    };
    return provider.handle(context, rpc.call).then(
      (result) => ({ result }),
      (error) => ({ error: toRpcError(error) }),
    );
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    for (const set of tabsByOrigin.values()) set.delete(tabId);
  });

  async function activeSite(): Promise<ActiveSiteView> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const origin = tab?.url ? safeOrigin(tab.url) : null;
    return {
      origin,
      connected: origin ? connections.isConnected(origin) : false,
      count: connections.count,
    };
  }

  return { provider, connections, approvals, activeSite };
}

function originOf(sender: { origin?: string; url?: string }): string | null {
  return sender.origin ?? (sender.url ? safeOrigin(sender.url) : null);
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

function toRpcError(error: unknown): { code: number; message: string } {
  const message = error instanceof Error ? error.message : "Request failed";
  const raw = (error as { code?: unknown }).code;
  return { code: typeof raw === "number" ? raw : RPC_ERROR.Internal, message };
}
