import { ChainKind, DappRequestKind } from "../../messaging/protocol.js";
import type { DappRequestView } from "../../messaging/protocol.js";
import { NETWORKS, type EvmNetwork } from "../../config/networks.js";
import { RPC_ERROR, type RpcCall } from "../../dapp/messages.js";
import { resolveActiveSigner, type ActiveSigner } from "../active-signer.js";
import { requiresConnection, routeOf, RpcRoute } from "./rpc-router.js";
import { Approvals, providerError } from "./approvals.js";
import { personalSign, sendTransaction, signTypedData } from "./evm-signer.js";
import {
  decodeMessage,
  parsePersonalSign,
  parseSwitchChain,
  parseTx,
  parseTypedData,
} from "./dapp-params.js";
import { passthrough } from "./passthrough-client.js";
import type { ConnectionStore } from "./connection-store.js";
import type { SettingsService } from "../services/settings-service.js";
import type { WalletService } from "../services/wallet-service.js";

// The origin plus display metadata (tab title/favicon), from the message sender.
export interface RequestContext {
  readonly origin: string;
  readonly name: string;
  readonly iconUrl: string | null;
}

// Sends a provider event to a single origin's tabs, or all connected tabs.
export type EmitEvent = (event: string, args: unknown, origin?: string) => void;

export interface ProviderService {
  handle(context: RequestContext, call: RpcCall): Promise<unknown>;
  emitAccountsChanged(): void;
  emitChainChanged(): void;
  emitDisconnected(origin: string): void;
}

interface Deps {
  readonly wallet: WalletService;
  readonly settings: SettingsService;
  readonly connections: ConnectionStore;
  readonly approvals: Approvals;
  readonly emit: EmitEvent;
}

export function createProviderService({
  wallet,
  settings,
  connections,
  approvals,
  emit,
}: Deps): ProviderService {
  // dApps are EVM; use the active network when it's EVM, else Ethereum mainnet.
  function dappNetwork(): EvmNetwork {
    const active = settings.activeNetwork();
    if (active.kind === ChainKind.Evm) return active;
    const ethereum = NETWORKS.find((n) => n.id === "ethereum");
    return ethereum as EvmNetwork;
  }

  function chainIdHex(): string {
    return `0x${dappNetwork().chain.id.toString(16)}`;
  }

  // The active account's EVM identity, even when the active network is non-EVM.
  function activeSigner(): ActiveSigner {
    return resolveActiveSigner(wallet, settings.activeAccountId, ChainKind.Evm);
  }

  function evmAddressSafe(): string | null {
    if (!wallet.isUnlocked) return null;
    try {
      return activeSigner().address;
    } catch {
      return null;
    }
  }

  function accountsFor(origin: string): string[] {
    const address = evmAddressSafe();
    return connections.isConnected(origin) && address ? [address] : [];
  }

  function requireMatch(requested: string, active: string): void {
    if (requested && requested.toLowerCase() !== active.toLowerCase()) {
      throw providerError(RPC_ERROR.Unauthorized, "Requested account is not the active account");
    }
  }

  function buildView(
    context: RequestContext,
    kind: DappRequestKind,
    extra: Partial<DappRequestView>,
  ): DappRequestView {
    const network = dappNetwork();
    return {
      id: crypto.randomUUID(),
      kind,
      origin: context.origin,
      name: context.name,
      iconUrl: context.iconUrl,
      account: extra.account ?? evmAddressSafe() ?? "",
      chainId: network.chain.id,
      networkName: network.name,
      message: extra.message ?? null,
      tx: extra.tx ?? null,
      chainName: extra.chainName ?? null,
    };
  }

  async function connect(context: RequestContext): Promise<string[]> {
    if (connections.isConnected(context.origin)) return accountsFor(context.origin);
    const view = buildView(context, DappRequestKind.Connect, {});
    const accounts = await approvals.request(view, async () => {
      await connections.connect({
        origin: context.origin,
        name: context.name,
        iconUrl: context.iconUrl,
        connectedAt: Date.now(),
      });
      const result = accountsFor(context.origin);
      emit("connect", { chainId: chainIdHex() }, context.origin);
      emit("accountsChanged", result, context.origin);
      return result;
    });
    return accounts as string[];
  }

  async function signMessageFlow(context: RequestContext, params: unknown): Promise<unknown> {
    const { messageHex, address } = parsePersonalSign(params);
    const view = buildView(context, DappRequestKind.SignMessage, {
      account: address || undefined,
      message: decodeMessage(messageHex),
    });
    return approvals.request(view, () => {
      const signer = activeSigner();
      requireMatch(address, signer.address);
      return personalSign(signer.sign, messageHex);
    });
  }

  async function signTypedDataFlow(context: RequestContext, params: unknown): Promise<unknown> {
    const { address, typedData, pretty } = parseTypedData(params);
    const view = buildView(context, DappRequestKind.SignTypedData, {
      account: address || undefined,
      message: pretty,
    });
    return approvals.request(view, () => {
      const signer = activeSigner();
      requireMatch(address, signer.address);
      return signTypedData(signer.sign, typedData);
    });
  }

  async function sendTxFlow(context: RequestContext, params: unknown): Promise<unknown> {
    const { from, tx, view: txView } = parseTx(params);
    const view = buildView(context, DappRequestKind.SendTransaction, {
      account: from || undefined,
      tx: txView,
    });
    return approvals.request(view, () => {
      const signer = activeSigner();
      requireMatch(from, signer.address);
      return sendTransaction(dappNetwork(), signer.address, tx, signer.sign);
    });
  }

  async function switchChain(context: RequestContext, params: unknown): Promise<null> {
    const target = parseSwitchChain(params);
    const network = settings
      .allNetworks()
      .find((n): n is EvmNetwork => n.kind === ChainKind.Evm && n.chain.id === target);
    if (!network) {
      throw providerError(4902, `Chain 0x${target.toString(16)} has not been added to OpenWallet`);
    }
    const view = buildView(context, DappRequestKind.SwitchChain, { chainName: network.name });
    await approvals.request(view, async () => {
      await settings.selectNetwork(network.id);
      emitChainChanged();
      return null;
    });
    return null;
  }

  function permissions(origin: string): unknown[] {
    return connections.isConnected(origin) ? [{ parentCapability: "eth_accounts" }] : [];
  }

  async function handle(context: RequestContext, { method, params }: RpcCall): Promise<unknown> {
    const route = routeOf(method);
    if (requiresConnection(route) && !connections.isConnected(context.origin)) {
      throw providerError(RPC_ERROR.Unauthorized, "Connect to OpenWallet first");
    }
    switch (route) {
      case RpcRoute.Connect:
        return connect(context);
      case RpcRoute.Accounts:
        return accountsFor(context.origin);
      case RpcRoute.Permissions:
        return permissions(context.origin);
      case RpcRoute.ChainId:
        return chainIdHex();
      case RpcRoute.NetVersion:
        return String(dappNetwork().chain.id);
      case RpcRoute.SwitchChain:
        return switchChain(context, params);
      case RpcRoute.SignMessage:
        return signMessageFlow(context, params);
      case RpcRoute.SignTypedData:
        return signTypedDataFlow(context, params);
      case RpcRoute.SendTransaction:
        return sendTxFlow(context, params);
      case RpcRoute.Unsupported:
        throw providerError(RPC_ERROR.Unsupported, `${method} is not supported`);
      default:
        return passthrough(dappNetwork(), method, params);
    }
  }

  function emitAccountsChanged(): void {
    const address = evmAddressSafe();
    emit("accountsChanged", address ? [address] : []);
  }

  function emitChainChanged(): void {
    emit("chainChanged", chainIdHex());
  }

  function emitDisconnected(origin: string): void {
    emit("accountsChanged", [], origin);
    emit("disconnect", { code: RPC_ERROR.Disconnected, message: "Disconnected" }, origin);
  }

  return { handle, emitAccountsChanged, emitChainChanged, emitDisconnected };
}
