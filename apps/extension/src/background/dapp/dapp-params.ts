import {
  hexToBigInt,
  hexToNumber,
  hexToString,
  isAddress,
  stringToHex,
  type Hex,
  type TypedDataDefinition,
} from "viem";
import { RPC_ERROR } from "../../dapp/messages.js";
import { providerError } from "./approvals.js";
import type { DappTx } from "./evm-signer.js";
import type { DappTxView } from "../../messaging/protocol.js";

// Parsing for dApp-supplied JSON-RPC params (untrusted input) — kept separate
// from provider-service.ts so the parsing rules can be read/tested on their
// own, apart from routing and approval flow.

function asArray(params: unknown): unknown[] {
  return Array.isArray(params) ? params : [];
}

function bigFromHex(value: string): bigint {
  return value.startsWith("0x") ? hexToBigInt(value as Hex) : BigInt(value);
}

export function parsePersonalSign(params: unknown): { messageHex: string; address: string } {
  const arr = asArray(params);
  const address = arr.find((p): p is string => typeof p === "string" && isAddress(p)) ?? "";
  const message = arr.find((p) => typeof p === "string" && p !== address);
  const raw = typeof message === "string" ? message : "";
  return { address, messageHex: raw.startsWith("0x") ? raw : stringToHex(raw) };
}

export function decodeMessage(messageHex: string): string {
  try {
    return hexToString(messageHex as Hex);
  } catch {
    return messageHex;
  }
}

export function parseTypedData(params: unknown): {
  address: string;
  typedData: TypedDataDefinition;
  pretty: string;
} {
  const arr = asArray(params);
  const address = arr.find((p): p is string => typeof p === "string" && isAddress(p)) ?? "";
  const raw = arr.find((p) => p !== address);
  const data: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
  return {
    address,
    typedData: data as TypedDataDefinition,
    pretty: JSON.stringify(data, null, 2),
  };
}

export function parseTx(params: unknown): { from: string; tx: DappTx; view: DappTxView } {
  const first = asArray(params)[0];
  const raw = (typeof first === "object" && first !== null ? first : {}) as Record<string, unknown>;
  const from = typeof raw.from === "string" ? raw.from : "";
  const to = typeof raw.to === "string" ? raw.to : null;
  const value = typeof raw.value === "string" ? bigFromHex(raw.value) : 0n;
  const data = typeof raw.data === "string" ? raw.data : "0x";
  const gas = typeof raw.gas === "string" ? bigFromHex(raw.gas) : null;
  return {
    from,
    tx: { to, value, data, gas },
    view: { to, value: value.toString(), data, gas: gas?.toString() ?? null },
  };
}

export function parseSwitchChain(params: unknown): number {
  const first = asArray(params)[0];
  const chainId = (typeof first === "object" && first !== null ? first : {}) as {
    chainId?: unknown;
  };
  if (typeof chainId.chainId !== "string") {
    throw providerError(RPC_ERROR.InvalidParams, "chainId is required");
  }
  return hexToNumber(chainId.chainId as Hex);
}
