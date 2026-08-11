// Wire shared by the three dApp contexts: the MAIN-world provider (inpage), the
// isolated content bridge, and the background. No browser/@openwallet imports so
// the inpage bundle stays tiny and page-safe.

// window.postMessage channels between the page provider and the content bridge.
export const INPAGE_TO_CONTENT = "openwallet:inpage->content";
export const CONTENT_TO_INPAGE = "openwallet:content->inpage";

// Marks our runtime messages so they don't collide with the popup's typed
// messaging (webext-core) that shares the same runtime channel.
export const DAPP_RUNTIME = "__openwallet_dapp";

export interface RpcCall {
  readonly method: string;
  readonly params?: unknown;
}

// page -> content -> background
export interface RpcMessage {
  readonly channel: typeof INPAGE_TO_CONTENT;
  readonly id: number;
  readonly call: RpcCall;
}

// content -> page (response to a call)
export interface RpcReply {
  readonly channel: typeof CONTENT_TO_INPAGE;
  readonly id: number;
  readonly result?: unknown;
  readonly error?: RpcError;
}

// content -> page (unsolicited provider event, e.g. accountsChanged)
export interface EventMessage {
  readonly channel: typeof CONTENT_TO_INPAGE;
  readonly event: string;
  readonly args: unknown;
}

export interface RpcError {
  readonly code: number;
  readonly message: string;
}

// Background runtime message envelopes (content <-> background).
export interface RuntimeRpc {
  readonly [DAPP_RUNTIME]: true;
  readonly kind: "rpc";
  readonly call: RpcCall;
}

export interface RuntimeEvent {
  readonly [DAPP_RUNTIME]: true;
  readonly kind: "event";
  readonly event: string;
  readonly args: unknown;
}

// EIP-1193 provider errors. 4001 user rejected, 4100 unauthorized, 4200
// unsupported, 4900 disconnected, -32602 invalid params, -32603 internal.
/**
 * An EIP-1193 provider error, carrying the numeric `code` a dApp switches on.
 *
 * Lives here rather than next to the approval window because it's part of the
 * wire contract, and because everything that imports it would otherwise drag
 * in `wxt/browser` — which is what kept `provider-service.ts` untestable
 * outside a browser.
 */
export function providerError(code: number, message: string): Error & { code: number } {
  return Object.assign(new Error(message), { code });
}

export const RPC_ERROR = {
  UserRejected: 4001,
  Unauthorized: 4100,
  Unsupported: 4200,
  Disconnected: 4900,
  InvalidParams: -32602,
  Internal: -32603,
} as const;
