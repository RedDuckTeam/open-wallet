import { browser } from "wxt/browser";
import type { DappRequestView } from "../../messaging/protocol.js";
import { RPC_ERROR, providerError } from "../../dapp/messages.js";

interface Pending {
  readonly view: DappRequestView;
  readonly run: () => Promise<unknown>;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
  windowId: number | null;
}

/**
 * How many requests may await the user at once.
 *
 * Every pending request owns a popup window, and nothing stopped a connected
 * site from calling `personal_sign` in a loop and opening an unbounded number
 * of them — enough to make the browser unusable and to bury a legitimate
 * prompt among decoys. Beyond this the request is rejected outright rather
 * than queued: a dApp that has five unanswered prompts is not waiting on
 * throughput, it is misbehaving.
 */
const MAX_PENDING = 5;

// Holds dApp requests awaiting the user, one approval popup window each. Closing
// the window without deciding rejects the request, so a dApp call never hangs.
export class Approvals {
  #pending = new Map<string, Pending>();
  #byWindow = new Map<number, string>();

  constructor() {
    browser.windows.onRemoved.addListener((windowId) => {
      const id = this.#byWindow.get(windowId);
      if (id !== undefined) this.reject(id);
    });
  }

  // Opens the approval window and resolves once the user (or the effect) settles.
  request(view: DappRequestView, run: () => Promise<unknown>): Promise<unknown> {
    if (this.#pending.size >= MAX_PENDING) {
      return Promise.reject(
        providerError(RPC_ERROR.Unsupported, "Too many pending OpenWallet requests"),
      );
    }
    return new Promise((resolve, reject) => {
      this.#pending.set(view.id, { view, run, resolve, reject, windowId: null });
      void this.#openWindow(view.id);
    });
  }

  pending(id: string): DappRequestView | null {
    return this.#pending.get(id)?.view ?? null;
  }

  // Runs the effect (sign/connect/etc.); rethrows so the approval window can show
  // the failure while leaving the dApp promise rejected.
  async approve(id: string): Promise<void> {
    const entry = this.#pending.get(id);
    if (!entry) return;
    try {
      entry.resolve(await entry.run());
    } catch (error) {
      entry.reject(error);
      throw error;
    } finally {
      this.#forget(id);
    }
  }

  reject(id: string): void {
    const entry = this.#pending.get(id);
    if (!entry) return;
    entry.reject(providerError(RPC_ERROR.UserRejected, "User rejected the request"));
    this.#forget(id);
  }

  async #openWindow(id: string): Promise<void> {
    const url = browser.runtime.getURL(`/popup.html#approve/${id}`);
    const created = await browser.windows.create({
      url,
      type: "popup",
      width: 384,
      height: 640,
      focused: true,
    });
    const entry = this.#pending.get(id);
    if (entry && created && typeof created.id === "number") {
      entry.windowId = created.id;
      this.#byWindow.set(created.id, id);
    }
  }

  // Drops bookkeeping only. The approval window closes itself on success/reject
  // (window.close()); on a signing error it stays open to show the failure.
  #forget(id: string): void {
    const entry = this.#pending.get(id);
    this.#pending.delete(id);
    if (typeof entry?.windowId === "number") this.#byWindow.delete(entry.windowId);
  }
}
