export type { Curve, KdfParams, DerivedKey } from "./crypto/types.js";
export { DEFAULT_KDF_PARAMS, DEFAULT_MNEMONIC_STRENGTH_BITS } from "./crypto/constants.js";
export { generateMnemonic, validateMnemonic, mnemonicToSeed } from "./crypto/mnemonic.js";
export { derivePublicKey } from "./crypto/public-key.js";
export { zero } from "./crypto/bytes.js";

export type { CoinEntry, Account, ImportedAccount } from "./keyring/types.js";
export { HdKeyring } from "./keyring/hd-keyring.js";
export { ImportedKeyring } from "./keyring/imported-keyring.js";

export type {
  SerializedVault,
  VaultSecrets,
  ImportedKeyRecord,
  SeedRecord,
  VaultStorage,
} from "./vault/types.js";
export { VaultUnlockError } from "./vault/errors.js";
export { Vault } from "./vault/vault.js";
export { InMemoryVaultStorage } from "./vault/storage.js";

export type {
  WalletOptions,
  PublicAccount,
  SeedInfo,
  SeedScope,
  WalletAccounts,
  WalletSeeds,
  WalletImportedAccounts,
} from "./wallet/types.js";
export { IMPORTED_ACCOUNT_PATH } from "./wallet/constants.js";
export { Wallet } from "./wallet/wallet.js";
export { LockTimer } from "./wallet/lock-timer.js";

export { SLIP44_BITCOIN, SLIP44_EVM, SLIP44_SOLANA } from "./chain/slip44.js";
export type {
  AddressValidator,
  NativeSendRequest,
  TokenOperations,
  ChainTypes,
  ChainAdapter,
} from "./chain/adapter.js";
export { ChainRegistry } from "./chain/registry.js";
export {
  BaseError,
  FeeTooLowError,
  InsufficientFundsError,
  InvalidAddressError,
} from "./errors.js";
