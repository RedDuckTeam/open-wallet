export { evmCoin } from "./coin.js";
export { EVM_COIN_TYPE, EVM_NATIVE_TRANSFER_GAS } from "./constants.js";
export { ERC20_ABI, ERC165_ABI, ERC721_ABI, ERC1155_ABI } from "./abi.js";

// NFTs (ERC-721 / ERC-1155). Off the `ChainAdapter` for the same reason as
// the AA layer: `TokenOperations` is a fungible-balance contract, and an NFT
// is identified by a token id rather than an amount.
export { NftStandard, ERC721_INTERFACE_ID, ERC1155_INTERFACE_ID } from "./nft/types.js";
export type { NftRef, NftItem, NftMetadata, NftAttribute, NftTransferParams } from "./nft/types.js";
export { detectNftStandard } from "./nft/standard.js";
export {
  DEFAULT_IPFS_GATEWAY,
  applyTokenIdTemplate,
  getTokenUri,
  parseNftMetadata,
  resolveUri,
} from "./nft/metadata.js";
export {
  fetchNftMetadata,
  getCollectionName,
  getNftBalance,
  getNftOwner,
  readNft,
} from "./nft/read.js";
export { buildNftTransfer, encodeNftTransfer } from "./nft/transfer.js";

// EIP-6551 token bound accounts.
export {
  DEFAULT_TBA_IMPLEMENTATION,
  DEFAULT_TBA_SALT,
  ERC6551_REGISTRY,
  encodeCreateTbaAccount,
  getTbaAddress,
  isTbaDeployed,
} from "./tba/registry.js";
export type { TbaRef } from "./tba/registry.js";
export { encodeTbaExecute, getTbaOwner, getTbaToken } from "./tba/execute.js";
export type { TbaCall } from "./tba/execute.js";
export { signTransaction, signMessage, signTypedData } from "./sign.js";
export { createEvmClient } from "./client.js";
export { getNativeBalance } from "./balance.js";
export { isValidAddress } from "./validate.js";
export { buildNativeTransfer, buildTransaction, broadcastTransaction } from "./transfer.js";
export type { RawTransactionParams } from "./transfer.js";
export { speedUpTransfer, cancelTransfer } from "./replace.js";
export {
  getErc20Balance,
  getErc20Metadata,
  buildErc20Transfer,
  encodeErc20Transfer,
} from "./erc20.js";
export { resolveEnsAddress, lookupEnsName } from "./ens.js";
export { getFeeTiers } from "./fee-tiers.js";
export { FeeTooLowError } from "./errors.js";
export { createEvmAdapter } from "./adapter.js";
export type { EvmChainTypes } from "./adapter.js";

// ERC-4337 account abstraction. Kept off the chain-agnostic `ChainAdapter`
// on purpose, the same way ENS and speed-up/cancel are: EntryPoints, User
// Operations and bundlers are an EVM-family concern, and forcing them into
// a contract Solana and Bitcoin also implement would invent an abstraction
// neither chain has.
export { SmartAccountKind } from "./aa/types.js";
export type {
  Call,
  CallsReceipt,
  CallsReceiptLog,
  PreparedCalls,
  SmartAccountInfo,
  UserOperationFees,
} from "./aa/types.js";
export { toOwnerAccount } from "./aa/signer.js";
export type { EvmSigner } from "./aa/signer.js";
export {
  DELEGATION_PREFIX,
  getDelegation,
  isDelegatedTo,
  parseDelegation,
} from "./aa/delegation.js";
export { revokeDelegation } from "./aa/revoke.js";
export { createBundler } from "./aa/bundler.js";
export type { BundlerConfig } from "./aa/bundler.js";
export {
  SIMPLE_7702_IMPLEMENTATION,
  coinbaseProvider,
  simple7702Provider,
  smartAccountProvider,
  soladyProvider,
} from "./aa/account.js";
export type { CreateSmartAccountParams, SmartAccountProvider } from "./aa/account.js";
export {
  createSmartAccountSession,
  getCallsReceipt,
  getSmartAccountInfo,
  prepareCalls,
  sendCalls,
  userOperationMaxCost,
  waitForCalls,
} from "./aa/user-operation.js";
export type {
  SmartAccountSession,
  SmartAccountSessionDeps,
  UserOperationGasFields,
} from "./aa/user-operation.js";
export type {
  NativeTransferParams,
  ReplacementFees,
  SpeedUpTransferParams,
  CancelTransferParams,
  Erc20Metadata,
  Erc20TransferParams,
  FeeEstimate,
  FeeTiers,
} from "./types.js";
