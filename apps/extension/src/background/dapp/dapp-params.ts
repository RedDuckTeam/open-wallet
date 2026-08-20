import {
  hexToBigInt,
  hexToNumber,
  hexToString,
  isAddress,
  isHex,
  stringToHex,
  type Address,
  type Hex,
  type TypedDataDefinition,
} from "viem";
import { RPC_ERROR, providerError } from "../../dapp/messages.js";

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

/**
 * `personal_sign(message, address)` — read by position, not by guessing.
 *
 * The obvious shortcut ("the argument that looks like an address is the
 * address") is wrong in a way that matters: a message whose *content* is a
 * valid address swaps the two, so the approval screen shows one thing and the
 * wallet signs another. Position is what the spec defines, so position is what
 * decides.
 *
 * The one tolerated deviation is the reversed order some older dApps emit,
 * inherited from `eth_sign(address, message)`. It's accepted only when the
 * first argument is an address *and* the second is not — an unambiguous case.
 */
export function parsePersonalSign(params: unknown): { messageHex: string; address: string } {
  const arr = asArray(params);
  const [first, second] = arr;
  const reversed =
    typeof first === "string" &&
    isAddress(first) &&
    !(typeof second === "string" && isAddress(second));
  const rawMessage = reversed ? second : first;
  const rawAddress = reversed ? first : second;
  const message = typeof rawMessage === "string" ? rawMessage : "";
  return {
    address: typeof rawAddress === "string" && isAddress(rawAddress) ? rawAddress : "",
    messageHex: message.startsWith("0x") ? message : stringToHex(message),
  };
}

export function decodeMessage(messageHex: string): string {
  try {
    return hexToString(messageHex as Hex);
  } catch {
    return messageHex;
  }
}

/**
 * `eth_signTypedData_v4(address, typedData)` — validated, not cast.
 *
 * Typed data is arbitrary input from a page, and it was previously asserted
 * into `TypedDataDefinition` unchecked. Two things go wrong with that. A
 * malformed document surfaces as an opaque failure deep inside viem instead
 * of a clear rejection; and, far worse, nothing looked at `domain.chainId` —
 * so a site on one chain could have the user sign a permit scoped to another,
 * which is a standard phishing shape.
 *
 * `chainId` is returned rather than checked here so this stays a pure parser;
 * the caller compares it against the chain actually selected (see
 * `provider-service.ts`).
 */
export function parseTypedData(params: unknown): {
  address: string;
  typedData: TypedDataDefinition;
  pretty: string;
  chainId: number | null;
} {
  const [first, second] = asArray(params);
  const reversed = !(typeof first === "string" && isAddress(first));
  const rawAddress = reversed ? second : first;
  const rawData = reversed ? first : second;

  let data: unknown;
  try {
    data = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
  } catch {
    throw providerError(RPC_ERROR.InvalidParams, "Typed data is not valid JSON");
  }
  if (typeof data !== "object" || data === null) {
    throw providerError(RPC_ERROR.InvalidParams, "Typed data must be an object");
  }

  const doc = data as Record<string, unknown>;
  const types = doc.types;
  const primaryType = doc.primaryType;
  if (typeof types !== "object" || types === null) {
    throw providerError(RPC_ERROR.InvalidParams, "Typed data is missing `types`");
  }
  if (typeof primaryType !== "string" || !(primaryType in types)) {
    throw providerError(RPC_ERROR.InvalidParams, "`primaryType` is missing from `types`");
  }
  if (typeof doc.message !== "object" || doc.message === null) {
    throw providerError(RPC_ERROR.InvalidParams, "Typed data is missing `message`");
  }
  const domain = doc.domain;
  if (domain !== undefined && (typeof domain !== "object" || domain === null)) {
    throw providerError(RPC_ERROR.InvalidParams, "`domain` must be an object");
  }

  return {
    address: typeof rawAddress === "string" && isAddress(rawAddress) ? rawAddress : "",
    typedData: data as TypedDataDefinition,
    pretty: JSON.stringify(data, null, 2),
    chainId: parseDomainChainId((domain ?? {}) as Record<string, unknown>),
  };
}

/** `domain.chainId` is a uint256 in the spec, so it legitimately arrives as a number, a decimal string, or hex. */
function parseDomainChainId(domain: Record<string, unknown>): number | null {
  const raw = domain.chainId;
  if (typeof raw === "number" && Number.isSafeInteger(raw)) return raw;
  if (typeof raw === "string" && raw.length > 0) {
    const parsed = raw.startsWith("0x") ? Number(hexToBigInt(raw as Hex)) : Number(raw);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
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

// ---- EIP-5792 (wallet_sendCalls / wallet_getCallsStatus / wallet_getCapabilities) ----

/** A batch a dApp asked to send, split into what the signer needs and what the UI shows. */
export interface SendCallsRequest {
  readonly from: string;
  /** The chain the dApp pinned the batch to, or null if it didn't. */
  readonly chainId: number | null;
  /**
   * EIP-5792's `atomicRequired`. This wallet executes every batch as one User
   * Operation, which is atomic by construction, so it can always honour
   * `true` — it's carried through only to be reported back in the status.
   */
  readonly atomicRequired: boolean;
  readonly calls: readonly { to: Address; value: bigint; data: Hex }[];
  readonly views: readonly DappTxView[];
}

export function parseSendCalls(params: unknown): SendCallsRequest {
  const first = asArray(params)[0];
  const raw = (typeof first === "object" && first !== null ? first : {}) as Record<string, unknown>;
  const rawCalls = Array.isArray(raw.calls) ? raw.calls : [];
  if (rawCalls.length === 0) {
    throw providerError(RPC_ERROR.InvalidParams, "wallet_sendCalls requires at least one call");
  }
  const calls = rawCalls.map((entry) => {
    const call = (typeof entry === "object" && entry !== null ? entry : {}) as Record<
      string,
      unknown
    >;
    // Unlike eth_sendTransaction, a call with no `to` is not a contract
    // deployment here — ERC-4337 accounts execute calls, so a missing target
    // is malformed input rather than a create.
    if (typeof call.to !== "string" || !isAddress(call.to)) {
      throw providerError(RPC_ERROR.InvalidParams, "each call needs a valid `to` address");
    }
    // Calldata is validated rather than passed through: it is the payload the
    // account will execute, and a malformed string would otherwise surface as
    // an opaque encoding failure deep inside the bundler.
    if (call.data !== undefined && !(typeof call.data === "string" && isHex(call.data))) {
      throw providerError(RPC_ERROR.InvalidParams, "call `data` must be a hex string");
    }
    return {
      to: call.to,
      value: typeof call.value === "string" ? bigFromHex(call.value) : 0n,
      data: (call.data ?? "0x") as Hex,
    };
  });
  return {
    from: typeof raw.from === "string" ? raw.from : "",
    chainId: typeof raw.chainId === "string" ? hexToNumber(raw.chainId as Hex) : null,
    atomicRequired: raw.atomicRequired === true,
    calls,
    views: calls.map((call) => ({
      to: call.to,
      value: call.value.toString(),
      data: call.data,
      gas: null,
    })),
  };
}

/** `wallet_getCapabilities` params: `[address, chainIds?]`. */
export function parseGetCapabilities(params: unknown): {
  address: string;
  chainIds: readonly number[] | null;
} {
  const [address, chainIds] = asArray(params);
  return {
    address: typeof address === "string" ? address : "",
    chainIds: Array.isArray(chainIds)
      ? chainIds
          .filter((id): id is string => typeof id === "string")
          .map((id) => hexToNumber(id as Hex))
      : null,
  };
}

const BATCH_ID_CHAIN_HEX = 16;
const BATCH_ID_LENGTH = 2 + 64 + BATCH_ID_CHAIN_HEX;

/**
 * A batch id that carries its own contents: the User Operation hash followed
 * by the chain id, as one opaque hex string.
 *
 * EIP-5792 leaves the id opaque, and the obvious implementation — a Map from
 * id to operation — is exactly wrong in an MV3 extension: the background
 * worker is evicted whenever it goes idle, so every in-flight batch a dApp
 * was polling would become permanently unknown. Encoding the state into the
 * id makes `wallet_getCallsStatus` stateless and survive eviction.
 */
export function encodeBatchId(chainId: number, userOpHash: string): string {
  return `${userOpHash}${chainId.toString(16).padStart(BATCH_ID_CHAIN_HEX, "0")}`;
}

export function decodeBatchId(id: string): { chainId: number; userOpHash: Hex } | null {
  if (typeof id !== "string" || id.length !== BATCH_ID_LENGTH || !id.startsWith("0x")) return null;
  const userOpHash = id.slice(0, 66);
  const chainId = Number.parseInt(id.slice(66), 16);
  if (!/^0x[0-9a-fA-F]{64}$/.test(userOpHash) || !Number.isSafeInteger(chainId) || chainId <= 0) {
    return null;
  }
  return { chainId, userOpHash: userOpHash as Hex };
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
