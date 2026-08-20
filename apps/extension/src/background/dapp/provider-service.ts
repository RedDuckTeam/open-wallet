import { ChainKind, DappRequestKind } from "../../messaging/protocol.js";
import type { DappRequestView } from "../../messaging/protocol.js";
import { NETWORKS, type EvmNetwork } from "../../config/networks.js";
import { RPC_ERROR, providerError, type RpcCall } from "../../dapp/messages.js";
import { resolveActiveSigner, type ActiveSigner } from "../active-signer.js";
import { requiresConnection, routeOf, RpcRoute } from "./rpc-router.js";
import type { Approvals } from "./approvals.js";
import { personalSign, sendTransaction, signTypedData } from "./evm-signer.js";
import {
  decodeBatchId,
  decodeMessage,
  encodeBatchId,
  parseGetCapabilities,
  parsePersonalSign,
  parseSendCalls,
  parseSwitchChain,
  parseTx,
  parseTypedData,
} from "./dapp-params.js";
import { passthrough } from "./passthrough-client.js";
import type { ConnectionStore } from "./connection-store.js";
import type { SettingsService } from "../services/settings-service.js";
import type { SmartAccountService } from "../smart-account.js";
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
  readonly smartAccounts: SmartAccountService;
  readonly connections: ConnectionStore;
  readonly approvals: Approvals;
  readonly emit: EmitEvent;
}

/**
 * EIP-5792 batch status codes. Only the ones this wallet can actually report
 * are listed: it either hasn't seen a receipt yet, has one that succeeded, or
 * has one whose calls reverted. There is no partial-revert case — every batch
 * runs as a single atomic User Operation.
 */
const CALLS_STATUS = { Pending: 100, Confirmed: 200, Reverted: 500 } as const;

export function createProviderService({
  wallet,
  settings,
  smartAccounts,
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
      batch: extra.batch ?? null,
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
    const { address, typedData, pretty, chainId } = parseTypedData(params);
    const network = dappNetwork();
    // The signature is only valid on the chain named in the domain, so a
    // mismatch means the user would be signing something scoped to a chain
    // they aren't on — the standard shape of a permit-phishing prompt.
    if (chainId !== null && chainId !== network.chain.id) {
      throw providerError(
        RPC_ERROR.Unauthorized,
        `Typed data is for chain ${String(chainId)}, but OpenWallet is on ${network.name}`,
      );
    }
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

  // ---- EIP-5792 ----

  /**
   * The `atomic` capability, answered from the account's real state rather
   * than from a static flag: `supported` once the account can already batch,
   * `ready` when this wallet can upgrade it on demand (which is exactly what
   * the first `wallet_sendCalls` does), `unsupported` with no bundler.
   */
  async function atomicStatus(network: EvmNetwork): Promise<"supported" | "ready" | "unsupported"> {
    if (!smartAccounts.isSupported(network)) return "unsupported";
    try {
      const info = await smartAccounts.status(network, activeSigner());
      const ours = info.delegatedTo === null || info.delegatedTo === info.implementation;
      const active = info.sharesOwnerAddress ? info.delegatedTo !== null && ours : info.deployed;
      // Delegated to another wallet's implementation: this wallet can't drive
      // it and won't overwrite it behind the user's back, so batching is not
      // on offer here.
      if (!ours) return "unsupported";
      return active ? "supported" : "ready";
    } catch {
      return "unsupported";
    }
  }

  async function getCapabilities(context: RequestContext, params: unknown): Promise<unknown> {
    if (!connections.isConnected(context.origin)) return {};
    const { address, chainIds } = parseGetCapabilities(params);
    const signer = evmAddressSafe();
    // Capabilities are per-account; answering for an address we don't control
    // would be a claim about someone else's account.
    if (address && signer && address.toLowerCase() !== signer.toLowerCase()) return {};

    const candidates = settings
      .allNetworks()
      .filter((network): network is EvmNetwork => network.kind === ChainKind.Evm)
      .filter((network) => (chainIds ? chainIds.includes(network.chain.id) : false));
    // With no chains named, EIP-5792 lets the wallet answer for what it likes;
    // one status probe per chain is an RPC round-trip, so default to the chain
    // the dApp is actually on rather than every network the user has.
    const networks = candidates.length > 0 ? candidates : [dappNetwork()];

    const entries = await Promise.all(
      networks.map(async (network) => {
        const status = await atomicStatus(network);
        return [`0x${network.chain.id.toString(16)}`, { atomic: { status } }] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  async function sendCallsFlow(context: RequestContext, params: unknown): Promise<unknown> {
    const request = parseSendCalls(params);
    const network = dappNetwork();
    if (request.chainId !== null && request.chainId !== network.chain.id) {
      throw providerError(
        RPC_ERROR.Unauthorized,
        `Batch is for chain 0x${request.chainId.toString(16)}, but OpenWallet is on ${network.name}`,
      );
    }
    if (!smartAccounts.isSupported(network)) {
      throw providerError(
        RPC_ERROR.Unsupported,
        `Batched calls are not available on ${network.name}`,
      );
    }
    const signer = activeSigner();
    requireMatch(request.from, signer.address);

    // Whether this batch will also upgrade the account. Checked *before*
    // preparing, because preparation is what attaches the EIP-7702
    // authorization — by the time the operation exists, the decision has
    // already been made, and the user has to be told about it up front.
    const upgradesAccount = !(await smartAccounts.canBatch(network, signer));

    // Priced before the approval window opens, so the fee the user sees is the
    // fee of the exact User Operation that will be sent — `sendCalls` transmits
    // this prepared operation rather than rebuilding it.
    const prepared = await smartAccounts.prepare(network, signer, request.calls);
    const view = buildView(context, DappRequestKind.SendCalls, {
      account: signer.address,
      batch: {
        calls: request.views,
        maxCostWei: prepared.fees.maxCostWei.toString(),
        sponsored: prepared.fees.sponsored,
        upgradesAccount,
      },
    });

    const userOpHash = await approvals.request(view, () =>
      smartAccounts.send(network, activeSigner(), prepared),
    );
    return { id: encodeBatchId(network.chain.id, String(userOpHash)) };
  }

  async function getCallsStatus(params: unknown): Promise<unknown> {
    const [id] = Array.isArray(params) ? params : [];
    const decoded = typeof id === "string" ? decodeBatchId(id) : null;
    if (!decoded) throw providerError(RPC_ERROR.InvalidParams, "Unknown batch id");

    const network = settings
      .allNetworks()
      .find(
        (candidate): candidate is EvmNetwork =>
          candidate.kind === ChainKind.Evm && candidate.chain.id === decoded.chainId,
      );
    if (!network) throw providerError(RPC_ERROR.InvalidParams, "Unknown batch id");

    const chainId = `0x${decoded.chainId.toString(16)}`;
    const receipt = await smartAccounts.receipt(network, activeSigner(), decoded.userOpHash);
    if (!receipt) {
      return { version: "2.0.0", id, chainId, atomic: true, status: CALLS_STATUS.Pending };
    }
    return {
      version: "2.0.0",
      id,
      chainId,
      atomic: true,
      status: receipt.success ? CALLS_STATUS.Confirmed : CALLS_STATUS.Reverted,
      receipts: [
        {
          transactionHash: receipt.transactionHash,
          status: receipt.success ? "0x1" : "0x0",
          blockNumber: `0x${receipt.blockNumber.toString(16)}`,
          // Gas *units*, not the wei cost — a consumer reading this as the
          // fee would be off by the gas price.
          gasUsed: `0x${receipt.gasUsed.toString(16)}`,
          logs: receipt.logs.map((log) => ({
            address: log.address,
            topics: log.topics,
            data: log.data,
          })),
        },
      ],
    };
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
      case RpcRoute.GetCapabilities:
        return getCapabilities(context, params);
      case RpcRoute.SendCalls:
        return sendCallsFlow(context, params);
      case RpcRoute.GetCallsStatus:
        return getCallsStatus(params);
      // Nothing to show: this wallet has no transaction-detail window, and
      // EIP-5792 makes the call a no-op hint rather than a required view.
      case RpcRoute.ShowCallsStatus:
        return null;
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
