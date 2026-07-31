import { describe, expect, it } from "vitest";
import {
  RpcRoute,
  requiresConnection,
  routeOf,
} from "../../apps/extension/src/background/dapp/rpc-router.js";

describe("routeOf", () => {
  it("classifies known methods", () => {
    expect(routeOf("eth_requestAccounts")).toBe(RpcRoute.Connect);
    expect(routeOf("eth_accounts")).toBe(RpcRoute.Accounts);
    expect(routeOf("eth_chainId")).toBe(RpcRoute.ChainId);
    expect(routeOf("wallet_switchEthereumChain")).toBe(RpcRoute.SwitchChain);
    expect(routeOf("personal_sign")).toBe(RpcRoute.SignMessage);
    expect(routeOf("eth_signTypedData_v4")).toBe(RpcRoute.SignTypedData);
    expect(routeOf("eth_sendTransaction")).toBe(RpcRoute.SendTransaction);
  });

  it("rejects unsafe methods", () => {
    expect(routeOf("eth_sign")).toBe(RpcRoute.Unsupported);
    expect(routeOf("wallet_addEthereumChain")).toBe(RpcRoute.Unsupported);
  });

  it("proxies unknown methods as reads", () => {
    expect(routeOf("eth_getBalance")).toBe(RpcRoute.Passthrough);
    expect(routeOf("eth_blockNumber")).toBe(RpcRoute.Passthrough);
  });
});

describe("requiresConnection", () => {
  it("gates state-changing and signing routes", () => {
    expect(requiresConnection(RpcRoute.SendTransaction)).toBe(true);
    expect(requiresConnection(RpcRoute.SignMessage)).toBe(true);
    expect(requiresConnection(RpcRoute.SwitchChain)).toBe(true);
  });

  it("allows reads and queries without a connection", () => {
    expect(requiresConnection(RpcRoute.ChainId)).toBe(false);
    expect(requiresConnection(RpcRoute.Accounts)).toBe(false);
    expect(requiresConnection(RpcRoute.Passthrough)).toBe(false);
  });
});
