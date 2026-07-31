import { defineContentScript, injectScript } from "#imports";
import { browser } from "wxt/browser";
import {
  CONTENT_TO_INPAGE,
  DAPP_RUNTIME,
  INPAGE_TO_CONTENT,
  type RpcError,
  type RpcMessage,
  type RuntimeEvent,
} from "../src/dapp/messages.js";

// Isolated-world bridge: injects the MAIN-world provider, forwards its RPC calls
// to the background, and pushes provider events from the background to the page.
export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_start",
  async main() {
    await injectScript("/inpage.js", { keepInDom: true });

    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data as RpcMessage | undefined;
      if (!data || data.channel !== INPAGE_TO_CONTENT) return;
      void relay(data);
    });

    browser.runtime.onMessage.addListener((message) => {
      const event = message as Partial<RuntimeEvent> | undefined;
      if (!event || event[DAPP_RUNTIME] !== true || event.kind !== "event") return;
      post({ channel: CONTENT_TO_INPAGE, event: event.event ?? "", args: event.args });
    });
  },
});

async function relay(message: RpcMessage): Promise<void> {
  try {
    const response = (await browser.runtime.sendMessage({
      [DAPP_RUNTIME]: true,
      kind: "rpc",
      call: message.call,
    })) as { result?: unknown; error?: RpcError } | undefined;
    post({
      channel: CONTENT_TO_INPAGE,
      id: message.id,
      result: response?.result,
      error: response?.error,
    });
  } catch (error) {
    post({
      channel: CONTENT_TO_INPAGE,
      id: message.id,
      error: { code: -32603, message: error instanceof Error ? error.message : "Bridge error" },
    });
  }
}

function post(payload: Record<string, unknown>): void {
  window.postMessage(payload, window.location.origin);
}
