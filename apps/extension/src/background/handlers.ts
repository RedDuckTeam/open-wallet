import { onMessage } from "../messaging/messenger.js";
import {
  encodeErc20Transfer,
  SmartAccountKind,
  type Call,
  type PreparedCalls,
} from "@openwallet/chain-evm";
import {
  AccountType,
  AssetKind,
  ChainKind,
  Message,
  NATIVE_ASSET_ID,
  WalletState,
  type AccountView,
  type AssetView,
  type CallsReceiptView,
  type NetworkView,
  type NftListView,
  type NftView,
  type PreparedCallsView,
  type SmartAccountView,
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
import { sanitizeSlippagePct, validateSlippagePct } from "../slippage.js";
import { nativeIconUrl, tokenIconUrl } from "./icons.js";
import { toWalletError } from "./errors.js";
import type { ChainService, TransferRequest } from "./chains.js";
import type { NftService } from "./nfts.js";
import type { SmartAccountService } from "./smart-account.js";
import type { SwapService } from "./swap.js";
import type { DappModule } from "./dapp/register.js";
import type { SettingsService } from "./services/settings-service.js";
import type { WalletService } from "./services/wallet-service.js";
import type { PriceProvider } from "./ports/price-provider.js";
import { toBaseUnits } from "../units.js";

export interface Handlers {
  readonly wallet: WalletService;
  readonly chains: ChainService;
  readonly smartAccounts: SmartAccountService;
  readonly nfts: NftService;
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
export function registerHandlers({
  wallet,
  chains,
  smartAccounts,
  nfts,
  swap,
  settings,
  prices,
  dapp,
}: Handlers): void {
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
  // Every handler first awaits `wallet.ready()`: after an MV3 worker eviction
  // the background restarts cold, and a request arriving mid-restore would
  // otherwise see a locked wallet that is about to unlock itself.
  const on: typeof onMessage = (type, handler) =>
    onMessage(
      type,
      (message) =>
        // The cast only re-narrows `void` back out of the awaited union: this
        // returns whatever the handler returns, having first waited for restore.
        wallet
          .ready()
          .then(() => handler(message))
          .catch(rethrow) as ReturnType<typeof handler>,
    );

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

  const networkList = (): NetworkView[] => settings.visibleNetworks().map(networkView);

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
      testnetMode: settings.testnetMode,
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

  on(Message.setTestnetMode, async ({ data }) => {
    noteActivity();
    await settings.setTestnetMode(data.enabled);
    // The flip can move activation to another chain; connected dApps must
    // hear about it the same way they do for an explicit network switch.
    dapp.provider.emitChainChanged();
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
    // ENS is resolved on L1, not on the active network — see `ENS_NETWORK_ID`.
    const address = await chains.resolveRecipient(
      settings.activeNetwork(),
      data.value,
      settings.ensNetwork(),
    );
    return { address };
  });

  /**
   * The same transfer expressed as one call for a smart account to execute.
   * Native value rides in `value`; a token transfer is calldata against the
   * token contract, exactly as `buildErc20Transfer` would have built it.
   */
  const transferAsCall = (request: TransferRequest): Call => {
    if (request.asset === AssetKind.Native) {
      return { to: request.to as `0x${string}`, value: request.amount };
    }
    return {
      to: request.token as `0x${string}`,
      data: encodeErc20Transfer({
        token: request.token as `0x${string}`,
        to: request.to as `0x${string}`,
        amount: request.amount,
      }),
    };
  };

  on(Message.send, async ({ data }) => {
    noteActivity();
    const network = settings.activeNetwork();
    const active = resolveActive(network);
    const request = transferRequest(network, active.address, data);

    // Routed through ERC-4337 when the account is already a smart account, so
    // an upgraded account actually transacts as one. Upgrading is never a side
    // effect of sending: `canBatch` is false until the user opts in on the
    // Smart account screen, and a plain transaction is used until then.
    const hash = (await smartAccounts.canBatch(network, active))
      ? await smartAccounts.executeCalls(network, active, [transferAsCall(request)])
      : await chains.transfer(network, request, active.sign);
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

  on(Message.getSwapSlippage, () => ({ pct: sanitizeSlippagePct(settings.slippagePct) }));

  on(Message.setSwapSlippage, async ({ data }) => {
    noteActivity();
    // Validated here, not trusted from the popup: the thrown message is
    // written for the user and crosses the wire as a WalletError.
    const pct = validateSlippagePct(data.pct);
    await settings.setSlippagePct(pct);
    return { pct };
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
    return swap.execute(network, active, data.execution);
  });

  // ---- Smart account (ERC-4337) ----

  // One prepared User Operation at a time. The popup can only be showing one
  // approval, and a map would keep stale operations — and the gas prices the
  // user was quoted with them — alive indefinitely.
  let pendingCalls: { id: string; networkId: string; prepared: PreparedCalls } | null = null;

  // Every field but `supported` is meaningless on a network with no bundler,
  // so they're empty rather than plausible-looking: a UI that ignores
  // `supported` should render obviously-blank, not a wrong address.
  // The endpoint half of the view, meaningful even when smart accounts aren't
  // available — a missing bundler is exactly what makes them unavailable, and
  // it's the field the user needs filled in to fix that.
  const smartAccountEndpoints = (
    network: NetworkConfig,
  ): Pick<
    SmartAccountView,
    "bundlerUrl" | "hasCustomBundler" | "paymasterUrl" | "hasCustomPaymaster"
  > => ({
    bundlerUrl: settings.bundlerUrl(network) ?? "",
    hasCustomBundler: settings.hasBundlerOverride(network.id),
    paymasterUrl: settings.paymasterUrl(network) ?? "",
    hasCustomPaymaster: settings.hasPaymasterOverride(network.id),
  });

  const smartAccountView = async (network: NetworkConfig): Promise<SmartAccountView> => {
    const endpoints = smartAccountEndpoints(network);
    // Everything else is meaningless without a bundler, and stays empty
    // rather than plausible-looking: a UI that ignores `supported` should
    // render obviously blank, not a wrong address.
    if (!smartAccounts.isSupported(network)) {
      return {
        supported: false,
        ...endpoints,
        kind: "",
        address: "",
        owner: "",
        sharesOwnerAddress: false,
        active: false,
        delegatedElsewhere: false,
        entryPoint: "",
        entryPointVersion: "",
      };
    }
    const info = await smartAccounts.status(network, resolveActive(network));
    const delegatedElsewhere =
      info.delegatedTo !== null && info.delegatedTo !== info.implementation;
    return {
      supported: true,
      ...endpoints,
      kind: info.kind,
      address: info.address,
      owner: info.owner,
      sharesOwnerAddress: info.sharesOwnerAddress,
      // For EIP-7702, `deployed` only says the EOA carries *a* delegation;
      // it's usable by this wallet only if it points at our implementation.
      active: info.sharesOwnerAddress
        ? info.delegatedTo !== null && !delegatedElsewhere
        : info.deployed,
      delegatedElsewhere,
      entryPoint: info.entryPoint,
      entryPointVersion: info.entryPointVersion,
    };
  };

  on(Message.getSmartAccount, async () => {
    noteActivity();
    return smartAccountView(settings.activeNetwork());
  });

  on(Message.prepareSmartAccountUpgrade, async () => {
    noteActivity();
    const network = settings.activeNetwork();
    // An empty batch on purpose: there is nothing to execute, the point is
    // the EIP-7702 authorization that preparation attaches to the operation.
    const prepared = await smartAccounts.prepare(network, resolveActive(network), []);
    const id = crypto.randomUUID();
    pendingCalls = { id, networkId: network.id, prepared };
    return {
      id,
      maxCostWei: prepared.fees.maxCostWei.toString(),
      sponsored: prepared.fees.sponsored,
    } satisfies PreparedCallsView;
  });

  on(Message.sendPreparedCalls, async ({ data }) => {
    noteActivity();
    const pending = pendingCalls;
    if (!pending || pending.id !== data.id) throw new Error("No prepared calls to send");
    // Cleared before sending, not after: a handle must never be replayable
    // into a second User Operation if the popup retries the message.
    pendingCalls = null;
    const network = settings.network(pending.networkId);
    return {
      userOpHash: await smartAccounts.send(network, resolveActive(network), pending.prepared),
    };
  });

  on(Message.awaitCalls, async ({ data }) => {
    const network = settings.activeNetwork();
    const receipt = await smartAccounts.wait(network, resolveActive(network), data.userOpHash);
    return {
      userOpHash: receipt.userOpHash,
      transactionHash: receipt.transactionHash,
      success: receipt.success,
      explorerUrl: txExplorerUrl(network, receipt.transactionHash),
    } satisfies CallsReceiptView;
  });

  on(Message.revertSmartAccount, async () => {
    noteActivity();
    const network = settings.activeNetwork();
    const hash = await smartAccounts.revoke(network, resolveActive(network));
    return { hash, explorerUrl: txExplorerUrl(network, hash) };
  });

  /**
   * Static, but served from the background so the picker can't drift from the
   * set of kinds this build actually supports.
   *
   * Only the EIP-7702 kind is `available`. The counterfactual ones are
   * implemented and tested in `@openwallet/chain-evm`, but the wallet is still
   * single-address everywhere above it: balances, the receive screen and the
   * accounts list all show the EOA. Letting a user "upgrade" into an account
   * whose funds the wallet then can't show — and whose sends `canBatch`
   * refuses to route — would be a dead end, so they're offered with the reason
   * attached rather than silently or not at all.
   */
  on(Message.smartAccountKinds, () => [
    {
      id: SmartAccountKind.Simple7702,
      label: "EIP-7702",
      sharesOwnerAddress: true,
      available: true,
      note: "Same address and balance",
    },
    {
      id: SmartAccountKind.Coinbase,
      label: "Coinbase Smart Wallet",
      sharesOwnerAddress: false,
      available: false,
      note: "Needs a second address in the UI",
    },
    {
      id: SmartAccountKind.Solady,
      label: "Solady",
      sharesOwnerAddress: false,
      available: false,
      note: "Needs a second address in the UI",
    },
  ]);

  on(Message.setSmartAccountKind, async ({ data }) => {
    noteActivity();
    // Validated rather than cast: this value is persisted, and a settings
    // blob holding a kind no build recognises is a wallet that can't tell
    // the user which contract their account is delegated to.
    const kind = Object.values(SmartAccountKind).find((known) => known === data.kind);
    if (!kind) throw new Error(`Unknown smart account kind: "${data.kind}"`);
    await settings.setSmartAccountKind(kind);
    return smartAccountView(settings.activeNetwork());
  });

  on(Message.setNetworkBundler, async ({ data }) => {
    noteActivity();
    await settings.setBundler(data.id, data.bundlerUrl);
    return smartAccountView(settings.activeNetwork());
  });

  on(Message.resetNetworkBundler, async ({ data }) => {
    noteActivity();
    await settings.resetBundler(data.id);
    return smartAccountView(settings.activeNetwork());
  });

  on(Message.setNetworkPaymaster, async ({ data }) => {
    noteActivity();
    await settings.setPaymaster(data.id, data.paymasterUrl);
    return smartAccountView(settings.activeNetwork());
  });

  on(Message.resetNetworkPaymaster, async ({ data }) => {
    noteActivity();
    await settings.resetPaymaster(data.id);
    return smartAccountView(settings.activeNetwork());
  });

  // ---- NFTs ----

  const nftView = (item: {
    standard: string;
    contract: string;
    tokenId: bigint;
    collection: string | null;
    balance: bigint;
    metadata: { name: string | null; description: string | null; imageUrl: string | null };
  }): NftView => ({
    standard: item.standard,
    contract: item.contract,
    tokenId: item.tokenId.toString(),
    name: item.metadata.name,
    collection: item.collection,
    description: item.metadata.description,
    imageUrl: item.metadata.imageUrl,
    balance: item.balance.toString(),
  });

  const nftListView = async (cursor?: string): Promise<NftListView> => {
    const network = settings.activeNetwork();
    const toggles = {
      autodetect: settings.autodetectNfts,
      displayMedia: settings.displayNftMedia,
    };
    if (network.kind !== ChainKind.Evm) {
      return { items: [], indexed: false, supported: false, nextCursor: null, ...toggles };
    }
    const owner = resolveActive(network).address;
    const listing = await nfts.list(network, owner, cursor);
    return {
      items: listing.items.map(nftView),
      indexed: listing.indexed,
      supported: true,
      nextCursor: listing.nextCursor,
      ...toggles,
    };
  };

  on(Message.getNfts, async ({ data }) => {
    noteActivity();
    return nftListView(data.cursor);
  });

  on(Message.getNftDetail, async ({ data }) => {
    noteActivity();
    const network = settings.activeNetwork();
    const owner = resolveActive(network).address;
    // Read from the token's own metadata document rather than the indexer:
    // attributes are exactly the field indexers report inconsistently.
    const item = await nfts.read(network, data.contract, data.tokenId, owner);
    return item ? item.metadata.attributes.map((a) => ({ trait: a.trait, value: a.value })) : [];
  });

  on(Message.setNftAutodetect, async ({ data }) => {
    noteActivity();
    await settings.setAutodetectNfts(data.enabled);
    return nftListView();
  });

  on(Message.setNftMedia, async ({ data }) => {
    noteActivity();
    await settings.setDisplayNftMedia(data.enabled);
    return nftListView();
  });

  on(Message.addNft, async ({ data }) => {
    noteActivity();
    const network = settings.activeNetwork();
    const owner = resolveActive(network).address;
    const item = await nfts.read(network, data.contract, data.tokenId, owner);
    // Refused rather than stored optimistically: persisting an address that
    // isn't an NFT contract would put a permanently broken card in the list.
    if (!item) throw new Error("That address is not an ERC-721 or ERC-1155 contract");
    if (item.balance === 0n) throw new Error("This account doesn't hold that token");
    await settings.addNft(network.id, data.contract, data.tokenId);
    return nftView(item);
  });

  on(Message.removeNft, async ({ data }) => {
    noteActivity();
    await settings.removeNft(settings.activeNetwork().id, data.contract, data.tokenId);
  });

  on(Message.sendNft, async ({ data }) => {
    noteActivity();
    const network = settings.activeNetwork();
    const active = resolveActive(network);
    const hash = await nfts.transfer(
      network,
      {
        standard: data.standard === "erc1155" ? "erc1155" : "erc721",
        contract: data.contract,
        tokenId: data.tokenId,
        from: active.address,
        to: data.to,
        ...(data.amount !== undefined && { amount: data.amount }),
      },
      active,
    );
    return { hash, explorerUrl: txExplorerUrl(network, hash) };
  });

  on(Message.getTokenBoundAccount, async ({ data }) => {
    noteActivity();
    const info = await nfts.tokenBoundAccount(
      settings.activeNetwork(),
      data.contract,
      data.tokenId,
    );
    return {
      address: info.address,
      deployed: info.deployed,
      nativeBalanceWei: info.nativeBalanceWei.toString(),
    };
  });

  on(Message.sendFromTokenBoundAccount, async ({ data }) => {
    noteActivity();
    const network = settings.activeNetwork();
    const hash = await nfts.sendFromTokenBoundAccount(
      network,
      data.contract,
      data.tokenId,
      { to: data.to, amount: data.amount, ...(data.token !== undefined && { token: data.token }) },
      resolveActive(network),
    );
    return { hash, explorerUrl: txExplorerUrl(network, hash) };
  });

  on(Message.deployTokenBoundAccount, async ({ data }) => {
    noteActivity();
    const network = settings.activeNetwork();
    const hash = await nfts.deployTokenBoundAccount(
      network,
      data.contract,
      data.tokenId,
      resolveActive(network),
    );
    return { hash, explorerUrl: txExplorerUrl(network, hash) };
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
