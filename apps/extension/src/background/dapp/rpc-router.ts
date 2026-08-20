// Maps a JSON-RPC method to how the background handles it. Pure and total: an
// unknown method proxies to the network RPC (a read), so new read methods work
// without changes here.
export const RpcRoute = {
  Connect: "connect",
  Accounts: "accounts",
  Permissions: "permissions",
  ChainId: "chainId",
  NetVersion: "netVersion",
  SwitchChain: "switchChain",
  SignMessage: "signMessage",
  SignTypedData: "signTypedData",
  SendTransaction: "sendTransaction",
  // EIP-5792: the standard dApp-facing surface for batched/account-abstracted
  // sends. This is how a dApp uses ERC-4337 through a wallet — not a bespoke
  // RPC method — so it's what the smart-account path is exposed as.
  GetCapabilities: "getCapabilities",
  SendCalls: "sendCalls",
  GetCallsStatus: "getCallsStatus",
  ShowCallsStatus: "showCallsStatus",
  Passthrough: "passthrough",
  Unsupported: "unsupported",
} as const;
export type RpcRoute = (typeof RpcRoute)[keyof typeof RpcRoute];

const ROUTES: Readonly<Record<string, RpcRoute>> = {
  eth_requestAccounts: RpcRoute.Connect,
  wallet_requestPermissions: RpcRoute.Connect,
  eth_accounts: RpcRoute.Accounts,
  wallet_getPermissions: RpcRoute.Permissions,
  eth_chainId: RpcRoute.ChainId,
  net_version: RpcRoute.NetVersion,
  wallet_switchEthereumChain: RpcRoute.SwitchChain,
  personal_sign: RpcRoute.SignMessage,
  eth_signTypedData_v3: RpcRoute.SignTypedData,
  eth_signTypedData_v4: RpcRoute.SignTypedData,
  eth_sendTransaction: RpcRoute.SendTransaction,
  wallet_getCapabilities: RpcRoute.GetCapabilities,
  wallet_sendCalls: RpcRoute.SendCalls,
  wallet_getCallsStatus: RpcRoute.GetCallsStatus,
  wallet_showCallsStatus: RpcRoute.ShowCallsStatus,
  // Deliberately unsupported: eth_sign is a blind-signing footgun; legacy typed
  // data and add-chain aren't implemented yet.
  eth_sign: RpcRoute.Unsupported,
  eth_signTypedData: RpcRoute.Unsupported,
  wallet_addEthereumChain: RpcRoute.Unsupported,
  // State-changing, so it must never reach the read-only passthrough below:
  // an unrouted method falls through to the node, which would let any page
  // broadcast a pre-signed transaction through the user's RPC without ever
  // passing an approval screen.
  eth_sendRawTransaction: RpcRoute.Unsupported,
  eth_signTransaction: RpcRoute.Unsupported,
};

export function routeOf(method: string): RpcRoute {
  return ROUTES[method] ?? RpcRoute.Passthrough;
}

// State-changing / key-using routes need an established connection first. Reads,
// chain/account queries, and discovery are served without one.
export function requiresConnection(route: RpcRoute): boolean {
  return (
    route === RpcRoute.SwitchChain ||
    route === RpcRoute.SignMessage ||
    route === RpcRoute.SignTypedData ||
    route === RpcRoute.SendTransaction ||
    route === RpcRoute.SendCalls
  );
}
