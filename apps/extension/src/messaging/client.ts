import { sendMessage } from "./messenger.js";
import {
  Message,
  type AddNetworkInput,
  type SwapExecutionView,
  type SwapTokenRef,
} from "./protocol.js";

// The popup's whole view of the wallet: a thin wrapper over sendMessage. The UI
// imports only this, never Wallet, a key, or a chain library.
export const walletApi = {
  getStatus: () => sendMessage(Message.getStatus, undefined),
  createWallet: (password: string) => sendMessage(Message.createWallet, { password }),
  importWallet: (mnemonic: string, password: string) =>
    sendMessage(Message.importWallet, { mnemonic, password }),
  unlock: (password: string) => sendMessage(Message.unlock, { password }),
  lock: () => sendMessage(Message.lock, undefined),
  reset: () => sendMessage(Message.reset, undefined),
  revealMnemonic: (password: string) => sendMessage(Message.revealMnemonic, { password }),

  addAccount: () => sendMessage(Message.addAccount, undefined),
  selectAccount: (id: string) => sendMessage(Message.selectAccount, { id }),
  hideAccount: (id: string) => sendMessage(Message.hideAccount, { id }),
  unhideAccount: (id: string) => sendMessage(Message.unhideAccount, { id }),
  importAccount: (privateKey: string, password: string) =>
    sendMessage(Message.importAccount, { privateKey, password }),
  removeAccount: (id: string, password: string) =>
    sendMessage(Message.removeAccount, { id, password }),

  selectNetwork: (id: string) => sendMessage(Message.selectNetwork, { id }),
  addNetwork: (input: AddNetworkInput) => sendMessage(Message.addNetwork, input),
  removeNetwork: (id: string) => sendMessage(Message.removeNetwork, { id }),
  setNetworkRpc: (id: string, rpcUrl: string) => sendMessage(Message.setNetworkRpc, { id, rpcUrl }),
  resetNetworkRpc: (id: string) => sendMessage(Message.resetNetworkRpc, { id }),

  getAssets: () => sendMessage(Message.getAssets, undefined),
  addToken: (address: string) => sendMessage(Message.addToken, { address }),
  removeToken: (address: string) => sendMessage(Message.removeToken, { address }),

  resolveRecipient: (value: string) => sendMessage(Message.resolveRecipient, { value }),
  send: (assetId: string, to: string, amount: string) =>
    sendMessage(Message.send, { assetId, to, amount }),
  getFeeReserve: (intent: "transfer" | "swap") => sendMessage(Message.getFeeReserve, { intent }),

  swapTokens: (query: string) => sendMessage(Message.swapTokens, { query }),
  getSwapQuote: (from: SwapTokenRef, to: SwapTokenRef, amount: string) =>
    sendMessage(Message.getSwapQuote, { from, to, amount }),
  executeSwap: (execution: SwapExecutionView) => sendMessage(Message.executeSwap, { execution }),

  getConnections: () => sendMessage(Message.getConnections, undefined),
  activeSiteConnection: () => sendMessage(Message.activeSiteConnection, undefined),
  disconnectSite: (origin: string) => sendMessage(Message.disconnectSite, { origin }),
  disconnectAllSites: () => sendMessage(Message.disconnectAllSites, undefined),
  dappPendingRequest: (id: string) => sendMessage(Message.dappPendingRequest, { id }),
  dappApproveRequest: (id: string) => sendMessage(Message.dappApproveRequest, { id }),
  dappRejectRequest: (id: string) => sendMessage(Message.dappRejectRequest, { id }),
};
