import { defineExtensionMessaging } from "@webext-core/messaging";
import type { ProtocolMap } from "./protocol.js";

// Kept out of protocol.ts: this pulls in browser-only webextension-polyfill,
// so protocol.ts stays side-effect free and importable in Node tests.
//
// breakError: true — the dApp RPC bridge (content.ts/register.ts) shares this
// same runtime.onMessage bus with a deliberately different, type/timestamp-
// free message shape. Without this flag, this library's root listener throws
// on every dApp RPC message instead of just ignoring the shape it doesn't own.
export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>({
  breakError: true,
});
