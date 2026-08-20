import type { Address, Hash, Hex } from "viem";
import type { UserOperation } from "viem/account-abstraction";

/**
 * One call inside a User Operation. A batch is just an array of these, and
 * atomicity is the whole point of routing through ERC-4337: either every
 * call in the batch executes or none does. A sequence of plain EOA
 * transactions can't promise that — approve-then-swap can land half-done.
 */
export interface Call {
  readonly to: Address;
  readonly value?: bigint;
  readonly data?: Hex;
}

/**
 * Which smart-account implementation backs an account. Kept as a const
 * object + derived union rather than a TS `enum` (same convention the
 * extension's wire protocol uses) so the values are plain strings that
 * survive persistence and cross a message boundary unchanged.
 *
 * The split that actually matters is `sharesOwnerAddress`, not the vendor:
 * `Simple7702` delegates the user's *existing* EOA, so the smart account's
 * address IS the EOA's address and no funds ever move. `Coinbase` and
 * `Solady` are counterfactual — a distinct address derived from the owner,
 * holding its own separate balance. See `SmartAccountProvider`.
 */
export const SmartAccountKind = {
  /** EIP-7702 delegation of the owner's own EOA — same address, no migration. */
  Simple7702: "simple-7702",
  /** Coinbase Smart Wallet: counterfactual, multi-owner (ECDSA + passkey). */
  Coinbase: "coinbase",
  /** Solady's minimal ERC-4337 account: counterfactual, cheapest to run. */
  Solady: "solady",
} as const;
export type SmartAccountKind = (typeof SmartAccountKind)[keyof typeof SmartAccountKind];

/**
 * What a wallet UI needs to describe an account's smart-account state
 * without knowing which implementation is behind it.
 *
 * `deployed` means different things per kind, deliberately surfaced through
 * one field: for a counterfactual account it's "the factory has run"; for
 * `Simple7702` it's "the EOA currently carries a delegation indicator". In
 * both cases it answers the same user-facing question — does this account
 * already behave as a smart account, or will the next User Operation be the
 * one that makes it so.
 */
export interface SmartAccountInfo {
  readonly kind: SmartAccountKind;
  /** The smart account's address — equal to `owner` exactly when `sharesOwnerAddress`. */
  readonly address: Address;
  /** The EOA that authorizes User Operations (the wallet's own derived account). */
  readonly owner: Address;
  readonly sharesOwnerAddress: boolean;
  readonly deployed: boolean;
  /**
   * For `Simple7702`, the implementation the EOA currently delegates to, or
   * `null` when it delegates to nothing. Always `null` for counterfactual
   * kinds, which express deployment through `deployed` instead.
   */
  readonly delegatedTo: Address | null;
  /**
   * The implementation this wallet would delegate to. Reported alongside
   * `delegatedTo` so a caller can tell "not upgraded" from "upgraded by a
   * different wallet" — an EOA delegated to someone else's account contract
   * is a real, common state (the user switched wallets), and silently
   * treating it as ours would sign User Operations against a contract whose
   * behaviour we haven't verified.
   */
  readonly implementation: Address | null;
  readonly entryPoint: Address;
  readonly entryPointVersion: string;
}

/**
 * The cost side of a prepared User Operation, in the shape an approval
 * screen needs. `maxCostWei` is ERC-4337's own required-prefund formula
 * (see `userOperationMaxCost`), not a re-estimate — it's the ceiling the
 * EntryPoint will actually hold against the account.
 */
export interface UserOperationFees {
  readonly maxFeePerGas: bigint;
  readonly maxPriorityFeePerGas: bigint;
  readonly callGasLimit: bigint;
  readonly verificationGasLimit: bigint;
  readonly preVerificationGas: bigint;
  readonly maxCostWei: bigint;
  /** True when a paymaster covers the cost, so `maxCostWei` is not charged to the user. */
  readonly sponsored: boolean;
}

/**
 * A User Operation that has been fully built and priced but not yet signed
 * — the ERC-4337 counterpart of this package's `TransactionSerializableEIP1559`.
 * Holding it between `prepareCalls` and `sendCalls` is what lets the wallet
 * show real numbers on the approval screen and then send *exactly* what was
 * approved, with no second estimation round that could silently change them.
 */
export interface PreparedCalls {
  readonly userOperation: UserOperation;
  readonly fees: UserOperationFees;
}

/** The outcome of a settled User Operation, flattened out of the bundler's receipt envelope. */
export interface CallsReceipt {
  readonly userOpHash: Hash;
  /** The bundle transaction that carried this User Operation on-chain. */
  readonly transactionHash: Hash;
  /**
   * Whether the *inner* calls succeeded. A User Operation can be mined in a
   * successful bundle transaction and still have reverted internally, so
   * this is not the same as the transaction's own status — checking only
   * the transaction would report a reverted swap as a success.
   */
  readonly success: boolean;
  readonly blockNumber: bigint;
  /** What the operation cost, in wei. */
  readonly actualGasCostWei: bigint;
  /** Gas *units* the carrying transaction burned — not the cost, which is the field above. */
  readonly gasUsed: bigint;
  /** Events emitted by the operation, for consumers that read them (EIP-5792 reports these). */
  readonly logs: readonly CallsReceiptLog[];
}

export interface CallsReceiptLog {
  readonly address: string;
  readonly topics: readonly string[];
  readonly data: string;
}
