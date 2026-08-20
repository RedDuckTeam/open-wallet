import { describe, expect, it } from "vitest";
import {
  decodeBatchId,
  encodeBatchId,
  parseGetCapabilities,
  parseSendCalls,
} from "../../apps/extension/src/background/dapp/dapp-params.js";
import {
  RpcRoute,
  requiresConnection,
  routeOf,
} from "../../apps/extension/src/background/dapp/rpc-router.js";

const TO = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const FROM = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const USER_OP_HASH = `0x${"ab".repeat(32)}`;

describe("EIP-5792 routing", () => {
  it("routes the batch methods away from the read-only passthrough", () => {
    expect(routeOf("wallet_sendCalls")).toBe(RpcRoute.SendCalls);
    expect(routeOf("wallet_getCallsStatus")).toBe(RpcRoute.GetCallsStatus);
    expect(routeOf("wallet_getCapabilities")).toBe(RpcRoute.GetCapabilities);
    expect(routeOf("wallet_showCallsStatus")).toBe(RpcRoute.ShowCallsStatus);
  });

  it("gates only the key-using batch method behind a connection", () => {
    expect(requiresConnection(RpcRoute.SendCalls)).toBe(true);
    // Reads: a status poll and a capability probe reveal nothing a connected
    // dApp couldn't already ask for, and erroring on them breaks discovery.
    expect(requiresConnection(RpcRoute.GetCallsStatus)).toBe(false);
    expect(requiresConnection(RpcRoute.GetCapabilities)).toBe(false);
  });

  it("keeps state-changing methods off the passthrough", () => {
    // Unrouted methods proxy straight to the node, so a state-changing method
    // landing there would bypass every approval screen.
    expect(routeOf("eth_sendRawTransaction")).toBe(RpcRoute.Unsupported);
    expect(routeOf("eth_signTransaction")).toBe(RpcRoute.Unsupported);
  });
});

describe("parseSendCalls", () => {
  it("reads a batch, defaulting value and data per call", () => {
    const request = parseSendCalls([
      {
        version: "2.0.0",
        from: FROM,
        chainId: "0x1",
        atomicRequired: true,
        calls: [
          { to: TO, value: "0x64" },
          { to: TO, data: "0xdeadbeef" },
        ],
      },
    ]);

    expect(request.from).toBe(FROM);
    expect(request.chainId).toBe(1);
    expect(request.atomicRequired).toBe(true);
    expect(request.calls).toEqual([
      { to: TO, value: 100n, data: "0x" },
      { to: TO, value: 0n, data: "0xdeadbeef" },
    ]);
  });

  it("reports no chain when the dApp didn't pin one", () => {
    expect(parseSendCalls([{ from: FROM, calls: [{ to: TO }] }]).chainId).toBeNull();
  });

  it("rejects an empty batch", () => {
    expect(() => parseSendCalls([{ from: FROM, calls: [] }])).toThrow();
    expect(() => parseSendCalls([{ from: FROM }])).toThrow();
  });

  it("rejects a call without a valid target — an account executes calls, it doesn't deploy", () => {
    expect(() => parseSendCalls([{ from: FROM, calls: [{ value: "0x1" }] }])).toThrow();
    expect(() => parseSendCalls([{ from: FROM, calls: [{ to: "not-an-address" }] }])).toThrow();
  });

  it("rejects calldata that isn't hex, instead of failing later inside the bundler", () => {
    expect(() =>
      parseSendCalls([{ from: FROM, calls: [{ to: TO, data: "definitely not hex" }] }]),
    ).toThrow();
  });

  it("produces a view per call for the approval screen", () => {
    const request = parseSendCalls([{ from: FROM, calls: [{ to: TO, value: "0x64" }] }]);

    expect(request.views).toEqual([{ to: TO, value: "100", data: "0x", gas: null }]);
  });
});

describe("batch ids", () => {
  it("round-trips the chain and operation hash it carries", () => {
    const id = encodeBatchId(8453, USER_OP_HASH);

    expect(decodeBatchId(id)).toEqual({ chainId: 8453, userOpHash: USER_OP_HASH });
  });

  it("stays a plain hex string, since EIP-5792 leaves the id opaque", () => {
    expect(encodeBatchId(1, USER_OP_HASH)).toMatch(/^0x[0-9a-f]{80}$/);
  });

  it("survives a background restart by construction — nothing is looked up", () => {
    // The id is self-describing, so a decode in a fresh worker still works.
    // This is the whole reason it isn't a Map key.
    const id = encodeBatchId(11_155_111, USER_OP_HASH);

    expect(decodeBatchId(id)?.chainId).toBe(11_155_111);
  });

  it("rejects ids it didn't issue", () => {
    expect(decodeBatchId("0x1234")).toBeNull();
    expect(decodeBatchId(USER_OP_HASH)).toBeNull();
    expect(decodeBatchId(`${USER_OP_HASH}0000000000000000`)).toBeNull();
    expect(decodeBatchId(`zz${"0".repeat(78)}`)).toBeNull();
  });
});

describe("parseGetCapabilities", () => {
  it("reads the address and the requested chains", () => {
    expect(parseGetCapabilities([FROM, ["0x1", "0x2105"]])).toEqual({
      address: FROM,
      chainIds: [1, 8453],
    });
  });

  it("reports no chain filter when the dApp asked for none", () => {
    expect(parseGetCapabilities([FROM]).chainIds).toBeNull();
  });
});
