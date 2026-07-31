import { onMessage } from "../messaging/messenger.js";
import {
  AccountType,
  AssetKind,
  Message,
  NATIVE_ASSET_ID,
  WalletState,
  type AccountView,
  type AssetView,
  type NetworkView,
} from "../messaging/protocol.js";
import {
  coinIdOf,
  rpcEndpoint,
  supportsTokens,
  txExplorerUrl,
  type NetworkConfig,
} from "../config/networks.js";
import { createAutoLock } from "./auto-lock.js";
import { hdAccountId, importedAccountId, parseAccountId } from "./account-id.js";
import { resolveActiveSigner, type ActiveSigner } from "./active-signer.js";
import { nativeIconUrl, tokenIconUrl } from "./icons.js";
import { toWalletError } from "./errors.js";
import type { ChainService, TransferRequest } from "./chains.js";
import type { SwapService } from "./swap.js";
import type { DappModule } from "./dapp/register.js";
import type { SettingsService } from "./services/settings-service.js";
import type { WalletService } from "./services/wallet-service.js";
import type { PriceProvider } from "./ports/price-provider.js";
import { toBaseUnits } from "../units.js";

export interface Handlers {
  readonly wallet: WalletService;
  readonly chains: ChainService;
  readonly swap: SwapService;
  readonly settings: SettingsService;
  readonly prices: PriceProvider;
  readonly dapp: DappModule;
}

interface NetworkPrices {
  readonly native: number | null;
  readonly tokens: Record<string, number>;
}

// Translates the wire protocol into service calls, composing WalletService,
// ChainService, SettingsService, the price provider, and auto-lock.
export function registerHandlers({ wallet, chains, swap, settings, prices, dapp }: Handlers): void {
  const autoLock = createAutoLock(() => {
    wallet.lock();
  });
  const noteActivity = (): void => {
    if (wallet.isUnlocked) autoLock.arm();
  };

  // onMessage, but every handler's throws become a coded WalletError for the
  // popup. Return type is preserved, so sync and async handlers both work.
  const rethrow = (error: unknown): never => {
    throw toWalletError(error);
  };
  const on: typeof onMessage = (type, handler) =>
    onMessage(type, (message) => {
      try {
        const result = handler(message);
        return result instanceof Promise ? result.catch(rethrow) : result;
      } catch (error) {
        return rethrow(error);
      }
    });

  // Revealed HD accounts plus imported ones for this network's coin.
  const accountsForNetwork = (network: NetworkConfig): AccountView[] => {
    const coinId = coinIdOf(network);
    const hidden = (id: string): boolean => settings.isAccountHidden(id);
    const hd = Array.from({ length: settings.accountCount }, (_, i): AccountView => {
      const id = hdAccountId(i);
      return {
        id,
        address: wallet.account(coinId, i).address,
        name: `Account ${String(i + 1)}`,
        type: AccountType.Hd,
        hidden: hidden(id),
      };
    });
    const imported = wallet.importedAccounts(coinId).map((account, i): AccountView => {
      const id = importedAccountId(coinId, account.address);
      return {
        id,
        address: account.address,
        name: `Imported ${String(i + 1)}`,
        type: AccountType.Imported,
        hidden: hidden(id),
      };
    });
    return [...hd, ...imported];
  };

  // Active account on this network, falling back to the first visible one.
  const activeAccountView = (network: NetworkConfig): AccountView | null => {
    const all = accountsForNetwork(network);
    return (
      all.find((account) => account.id === settings.activeAccountId) ??
      all.find((account) => !account.hidden) ??
      all[0] ??
      null
    );
  };

  // Active account's address and a signer (HD or imported).
  const resolveActive = (network: NetworkConfig): ActiveSigner =>
    resolveActiveSigner(wallet, settings.activeAccountId, coinIdOf(network));

  // Turns a wire send (asset id + human amount) into a base-unit TransferRequest.
  const transferRequest = (
    network: NetworkConfig,
    from: string,
    data: { readonly assetId: string; readonly to: string; readonly amount: string },
  ): TransferRequest => {
    if (data.assetId === NATIVE_ASSET_ID) {
      return {
        asset: AssetKind.Native,
        from,
        to: data.to,
        amount: toBaseUnits(data.amount, network.nativeDecimals),
      };
    }
    const token = settings
      .tokens(network.id)
      .find((t) => t.address.toLowerCase() === data.assetId.toLowerCase());
    if (!token) throw new Error("Unknown token");
    return {
      asset: AssetKind.Token,
      token: token.address,
      from,
      to: data.to,
      amount: toBaseUnits(data.amount, token.decimals),
    };
  };

  const networkView = (network: NetworkConfig): NetworkView => ({
    id: network.id,
    kind: network.kind,
    name: network.name,
    symbol: network.nativeSymbol,
    decimals: network.nativeDecimals,
    supportsTokens: supportsTokens(network),
    color: network.color,
    isPrimary: network.primary ?? false,
    isTestnet: network.testnet ?? false,
    isCustom: settings.isCustomNetwork(network.id),
    rpcUrl: rpcEndpoint(network),
    hasCustomRpc: settings.hasRpcOverride(network.id),
  });

  const networkList = (): NetworkView[] => settings.allNetworks().map(networkView);

  async function loadPrices(
    network: NetworkConfig,
    tokenAddresses: readonly string[],
  ): Promise<NetworkPrices> {
    const config = network.coingecko;
    if (!config) return { native: null, tokens: {} };
    const [native, tokens] = await Promise.all([
      prices.nativeUsd(config.nativeId),
      prices.tokensUsd(config.platform, tokenAddresses),
    ]);
    return { native, tokens };
  }

  on(Message.getStatus, async () => {
    const state = await wallet.state();
    const network = settings.activeNetwork();
    const unlocked = state === WalletState.Unlocked;
    return {
      state,
      account: unlocked ? activeAccountView(network) : null,
      accounts: unlocked ? accountsForNetwork(network) : [],
      network: networkView(network),
      networks: networkList(),
    };
  });

  on(Message.createWallet, async ({ data }) => {
    const mnemonic = await wallet.create(data.password);
    autoLock.arm();
    return { mnemonic };
  });

  on(Message.importWallet, async ({ data }) => {
    await wallet.import(data.mnemonic, data.password);
    autoLock.arm();
  });

  on(Message.unlock, async ({ data }) => {
    await wallet.unlock(data.password);
    autoLock.arm();
  });

  on(Message.lock, () => {
    wallet.lock();
    autoLock.disarm();
    dapp.provider.emitAccountsChanged();
  });

  on(Message.reset, async () => {
    await wallet.reset();
    autoLock.disarm();
    dapp.provider.emitAccountsChanged();
  });

  on(Message.revealMnemonic, async ({ data }) => ({
    mnemonic: await wallet.revealMnemonic(data.password),
  }));

  on(Message.addAccount, async () => {
    noteActivity();
    const network = settings.activeNetwork();
    const index = await settings.addAccount();
    dapp.provider.emitAccountsChanged();
    return {
      id: hdAccountId(index),
      address: wallet.account(coinIdOf(network), index).address,
      name: `Account ${String(index + 1)}`,
      type: AccountType.Hd,
      hidden: false,
    };
  });

  on(Message.selectAccount, async ({ data }) => {
    noteActivity();
    await settings.selectAccount(data.id);
    dapp.provider.emitAccountsChanged();
  });

  on(Message.hideAccount, async ({ data }) => {
    noteActivity();
    await settings.hideAccount(data.id);
    return accountsForNetwork(settings.activeNetwork());
  });

  on(Message.unhideAccount, async ({ data }) => {
    noteActivity();
    await settings.unhideAccount(data.id);
    return accountsForNetwork(settings.activeNetwork());
  });

  on(Message.importAccount, async ({ data }) => {
    noteActivity();
    const network = settings.activeNetwork();
    const coinId = coinIdOf(network);
    const privateKey = data.privateKey.trim().replace(/^0x/i, "");
    const account = await wallet.importPrivateKey(data.password, coinId, privateKey);
    await settings.selectAccount(importedAccountId(coinId, account.address));
    dapp.provider.emitAccountsChanged();
  });

  on(Message.removeAccount, async ({ data }) => {
    noteActivity();
    const ref = parseAccountId(data.id);
    if (ref.type !== AccountType.Imported) throw new Error("Only imported accounts can be removed");
    await wallet.removeImported(data.password, ref.coinId, ref.address);
    if (settings.activeAccountId === data.id) await settings.selectAccount(hdAccountId(0));
    dapp.provider.emitAccountsChanged();
  });

  on(Message.selectNetwork, async ({ data }) => {
    noteActivity();
    await settings.selectNetwork(data.id);
    dapp.provider.emitChainChanged();
    dapp.provider.emitAccountsChanged();
  });

  on(Message.addNetwork, async ({ data }) => {
    noteActivity();
    await settings.addNetwork(data);
    return networkList();
  });

  on(Message.removeNetwork, async ({ data }) => {
    noteActivity();
    await settings.removeNetwork(data.id);
    return networkList();
  });

  on(Message.setNetworkRpc, async ({ data }) => {
    noteActivity();
    await settings.setRpc(data.id, data.rpcUrl);
    return networkList();
  });

  on(Message.resetNetworkRpc, async ({ data }) => {
    noteActivity();
    await settings.resetRpc(data.id);
    return networkList();
  });

  on(Message.getAssets, async () => {
    noteActivity();
    const network = settings.activeNetwork();
    const adapter = chains.adapterFor(network);
    const owner = resolveActive(network).address;
    const tokenOps = adapter.tokens;
    const tokenConfigs = tokenOps ? settings.tokens(network.id) : [];

    const [nativeWei, tokenBalances, priced] = await Promise.all([
      adapter.getNativeBalance(owner),
      Promise.all(
        tokenConfigs.map((token) =>
          tokenOps ? tokenOps.getBalance(token.address, owner) : Promise.resolve(0n),
        ),
      ),
      loadPrices(
        network,
        tokenConfigs.map((token) => token.address),
      ),
    ]);

    const tokens: AssetView[] = tokenConfigs.map((token, i) => ({
      id: token.address,
      kind: AssetKind.Token,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      address: token.address,
      balanceWei: tokenBalances[i].toString(),
      priceUsd: priced.tokens[token.address.toLowerCase()] ?? null,
      iconUrl: tokenIconUrl(network, token.address),
    }));

    const native: AssetView = {
      id: NATIVE_ASSET_ID,
      kind: AssetKind.Native,
      symbol: network.nativeSymbol,
      name: network.name,
      decimals: network.nativeDecimals,
      address: null,
      balanceWei: nativeWei.toString(),
      priceUsd: priced.native,
      iconUrl: nativeIconUrl(network),
    };

    return [native, ...tokens];
  });

  on(Message.addToken, async ({ data }) => {
    noteActivity();
    const network = settings.activeNetwork();
    const tokenOps = chains.adapterFor(network).tokens;
    if (!tokenOps) throw new Error("This network doesn't support custom tokens");

    const metadata = await chains.tokenMetadata(network, data.address);
    const token = { address: data.address, ...metadata };
    await settings.addToken(network.id, token);

    const [wei, priced] = await Promise.all([
      tokenOps.getBalance(token.address, resolveActive(network).address),
      loadPrices(network, [token.address]),
    ]);
    return {
      id: token.address,
      kind: AssetKind.Token,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      address: token.address,
      balanceWei: wei.toString(),
      priceUsd: priced.tokens[token.address.toLowerCase()] ?? null,
      iconUrl: tokenIconUrl(network, token.address),
    };
  });

  on(Message.removeToken, async ({ data }) => {
    noteActivity();
    await settings.removeToken(settings.activeNetwork().id, data.address);
  });

  on(Message.resolveRecipient, async ({ data }) => {
    noteActivity();
    return { address: await chains.resolveRecipient(settings.activeNetwork(), data.value) };
  });

  on(Message.send, async ({ data }) => {
    noteActivity();
    const network = settings.activeNetwork();
    const active = resolveActive(network);
    const request = transferRequest(network, active.address, data);

    const hash = await chains.transfer(network, request, active.sign);
    return { hash, explorerUrl: txExplorerUrl(network, hash) };
  });

  on(Message.getFeeReserve, async ({ data }) => {
    noteActivity();
    const network = settings.activeNetwork();
    const address = resolveActive(network).address;
    const reserve = await chains.feeReserve(network, address, data.intent);
    return { reserveWei: reserve.toString() };
  });

  on(Message.swapTokens, async ({ data }) => {
    noteActivity();
    return swap.tokens(settings.activeNetwork(), data.query);
  });

  on(Message.getSwapQuote, async ({ data }) => {
    noteActivity();
    const network = settings.activeNetwork();
    const from = resolveActive(network).address;
    // A null ref address means the native asset; swap.ts resolves it to
    // whichever sentinel the active chain's aggregator expects.
    const fromAmount = toBaseUnits(data.amount, data.from.decimals).toString();
    return swap.getQuote(network, from, data.from.address, data.to.address, fromAmount);
  });

  on(Message.executeSwap, async ({ data }) => {
    noteActivity();
    const network = settings.activeNetwork();
    const active = resolveActive(network);
    return swap.execute(network, active.address, data.execution, active.sign);
  });

  // dApp connection management (popup)
  on(Message.getConnections, () => {
    noteActivity();
    return dapp.connections.list();
  });

  on(Message.activeSiteConnection, () => dapp.activeSite());

  on(Message.disconnectSite, async ({ data }) => {
    noteActivity();
    await dapp.connections.disconnect(data.origin);
    dapp.provider.emitDisconnected(data.origin);
    return dapp.connections.list();
  });

  on(Message.disconnectAllSites, async () => {
    noteActivity();
    const origins = dapp.connections.list().map((c) => c.origin);
    await dapp.connections.disconnectAll();
    for (const origin of origins) dapp.provider.emitDisconnected(origin);
    return dapp.connections.list();
  });

  // dApp approval window
  on(Message.dappPendingRequest, ({ data }) => dapp.approvals.pending(data.id));

  on(Message.dappApproveRequest, async ({ data }) => {
    noteActivity();
    await dapp.approvals.approve(data.id);
  });

  on(Message.dappRejectRequest, ({ data }) => {
    dapp.approvals.reject(data.id);
  });
}
