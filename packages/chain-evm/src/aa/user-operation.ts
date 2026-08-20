import { getAddress } from "viem";
import type { Address, Hash, PublicClient } from "viem";
import type { BundlerClient, SmartAccount, UserOperation } from "viem/account-abstraction";
import { createBundler, type BundlerConfig } from "./bundler.js";
import { getDelegation } from "./delegation.js";
import { simple7702Provider, type SmartAccountProvider } from "./account.js";
import { toOwnerAccount, type EvmSigner } from "./signer.js";
import type {
  Call,
  CallsReceipt,
  PreparedCalls,
  SmartAccountInfo,
  SmartAccountKind,
  UserOperationFees,
} from "./types.js";

/**
 * Everything one account needs to transact through ERC-4337 on one chain,
 * resolved once: the viem smart account, the bundler it submits to, and the
 * node it reads state from.
 *
 * Held by the caller between operations the same way `PublicClient` is —
 * building it costs a round-trip (a counterfactual account's address is
 * computed against the factory), so it shouldn't be rebuilt per call. It
 * holds no secret: the owner inside is a capability handle over
 * `EvmSigner.withPrivateKey`, not a key.
 */
export interface SmartAccountSession {
  readonly kind: SmartAccountKind;
  readonly sharesOwnerAddress: boolean;
  readonly owner: Address;
  readonly implementation: Address | null;
  readonly account: SmartAccount;
  readonly bundler: BundlerClient;
  readonly client: PublicClient;
}

export interface SmartAccountSessionDeps {
  readonly client: PublicClient;
  readonly signer: EvmSigner;
  readonly bundler: BundlerConfig;
  /** Defaults to `simple7702Provider()` — same address, nothing to migrate. */
  readonly provider?: SmartAccountProvider;
}

export async function createSmartAccountSession(
  deps: SmartAccountSessionDeps,
): Promise<SmartAccountSession> {
  const provider = deps.provider ?? simple7702Provider();
  const owner = toOwnerAccount(deps.signer);
  const account = await provider.create({ client: deps.client, owner });
  return {
    kind: provider.kind,
    sharesOwnerAddress: provider.sharesOwnerAddress,
    owner: getAddress(deps.signer.address),
    implementation: provider.implementation,
    account,
    bundler: createBundler(deps.client, deps.bundler),
    client: deps.client,
  };
}

/** The account's current smart-account state, in the shape a UI can render without knowing the kind. */
export async function getSmartAccountInfo(session: SmartAccountSession): Promise<SmartAccountInfo> {
  const [address, deployed, delegatedTo] = await Promise.all([
    session.account.getAddress(),
    session.account.isDeployed(),
    // Only meaningful for EIP-7702: a counterfactual account's code is the
    // account itself, not a delegation indicator, so reading one there would
    // always be `null` at the cost of a pointless RPC call.
    session.sharesOwnerAddress
      ? getDelegation(session.client, session.owner)
      : Promise.resolve(null),
  ]);
  return {
    kind: session.kind,
    address,
    owner: session.owner,
    sharesOwnerAddress: session.sharesOwnerAddress,
    deployed,
    delegatedTo,
    implementation: session.implementation,
    entryPoint: session.account.entryPoint.address,
    entryPointVersion: session.account.entryPoint.version,
  };
}

/**
 * The gas fields that decide what a User Operation can cost. Declared
 * structurally rather than as viem's `UserOperation` so the formula can be
 * tested against plain objects — and so the two paymaster fields, which
 * only exist from EntryPoint 0.7 onward, stay optional instead of forcing a
 * version-discriminated union through every caller.
 */
export interface UserOperationGasFields {
  readonly callGasLimit: bigint;
  readonly verificationGasLimit: bigint;
  readonly preVerificationGas: bigint;
  readonly maxFeePerGas: bigint;
  readonly paymasterVerificationGasLimit?: bigint | undefined;
  readonly paymasterPostOpGasLimit?: bigint | undefined;
}

/**
 * ERC-4337's required-prefund: the ceiling the EntryPoint holds against the
 * account (or its paymaster) before execution. Every gas limit in the
 * operation counts, including the paymaster's own two — leaving those out
 * under-reports the cost of a sponsored operation, and an approval screen
 * that under-reports is worse than one that doesn't show a number at all.
 *
 * `maxPriorityFeePerGas` deliberately isn't part of it: the prefund is
 * computed at `maxFeePerGas`, and the priority fee only ever lowers the
 * amount actually charged.
 */
export function userOperationMaxCost(userOperation: UserOperationGasFields): bigint {
  const gas =
    userOperation.callGasLimit +
    userOperation.verificationGasLimit +
    userOperation.preVerificationGas +
    (userOperation.paymasterVerificationGasLimit ?? 0n) +
    (userOperation.paymasterPostOpGasLimit ?? 0n);
  return gas * userOperation.maxFeePerGas;
}

/**
 * Builds and prices a batch without signing it — the ERC-4337 counterpart of
 * `buildTransaction`, and the first half of the same
 * build → sign → broadcast pipe the rest of this package uses.
 *
 * Splitting it from `sendCalls` is what lets an approval screen show the
 * exact operation that will be sent: `sendCalls` transmits this operation
 * verbatim rather than re-preparing it, so the numbers a user approves and
 * the numbers that execute cannot diverge. (viem's own `sendUserOperation`
 * re-runs preparation whenever it's given an account, which would quietly
 * re-price the operation after approval — hence the explicit two phases.)
 *
 * For an undeployed EIP-7702 account, preparation is also where the
 * delegation authorization gets signed and attached, so the first batch a
 * user sends is what upgrades the account.
 */
export async function prepareCalls(
  session: SmartAccountSession,
  calls: readonly Call[],
): Promise<PreparedCalls> {
  const userOperation = (await session.bundler.prepareUserOperation({
    account: session.account,
    calls,
  })) as UserOperation;
  return { userOperation, fees: toFees(userOperation) };
}

function toFees(userOperation: UserOperation): UserOperationFees {
  return {
    maxFeePerGas: userOperation.maxFeePerGas,
    maxPriorityFeePerGas: userOperation.maxPriorityFeePerGas,
    callGasLimit: userOperation.callGasLimit,
    verificationGasLimit: userOperation.verificationGasLimit,
    preVerificationGas: userOperation.preVerificationGas,
    maxCostWei: userOperationMaxCost(userOperation),
    sponsored: isSponsored(userOperation),
  };
}

/**
 * A paymaster is committed to the operation under two different encodings:
 * a `paymaster` address from EntryPoint 0.7 on, and packed
 * `paymasterAndData` on 0.6. Checking both keeps the flag honest across the
 * EntryPoint versions a bundler may serve, instead of silently reporting
 * "not sponsored" on a 0.6 account.
 */
function isSponsored(userOperation: UserOperation): boolean {
  if ("paymaster" in userOperation && userOperation.paymaster) return true;
  return (
    "paymasterAndData" in userOperation &&
    typeof userOperation.paymasterAndData === "string" &&
    userOperation.paymasterAndData !== "0x"
  );
}

/**
 * Signs a prepared batch and submits it, returning the User Operation hash.
 *
 * Omitting the account is what makes this the "broadcast" step rather than
 * a second build: given an account, viem re-prepares the operation from
 * scratch; given none, it falls back to the operation's own `sender` and
 * sends exactly the bytes it was handed. The bundler client is created
 * without a default account precisely so this stays true.
 */
export async function sendCalls(
  session: SmartAccountSession,
  prepared: PreparedCalls,
): Promise<Hash> {
  const signature = await session.account.signUserOperation(prepared.userOperation);
  return session.bundler.sendUserOperation({
    ...prepared.userOperation,
    account: undefined,
    signature,
    entryPointAddress: session.account.entryPoint.address,
  });
}

/**
 * The receipt for a User Operation if the bundler already has one, or `null`
 * while it's still in flight.
 *
 * The non-blocking counterpart of `waitForCalls`, and the one a status poll
 * (EIP-5792's `wallet_getCallsStatus`) needs: "not settled yet" is a normal
 * answer there, not a timeout to surface as an error.
 */
export async function getCallsReceipt(
  session: SmartAccountSession,
  userOpHash: Hash,
): Promise<CallsReceipt | null> {
  const receipt = await session.bundler.getUserOperationReceipt({ hash: userOpHash });
  return receipt === null ? null : toCallsReceipt(userOpHash, receipt);
}

/**
 * Waits for the bundler to report a receipt and flattens it.
 *
 * `success` is read from the User Operation's own result, not from the
 * bundle transaction's status: a reverted operation still rides in a
 * perfectly successful bundle, so trusting the transaction receipt alone
 * would report a failed send as a completed one.
 */
export async function waitForCalls(
  session: SmartAccountSession,
  userOpHash: Hash,
  options: { readonly timeoutMs?: number; readonly pollingIntervalMs?: number } = {},
): Promise<CallsReceipt> {
  const receipt = await session.bundler.waitForUserOperationReceipt({
    hash: userOpHash,
    ...(options.timeoutMs !== undefined && { timeout: options.timeoutMs }),
    ...(options.pollingIntervalMs !== undefined && { pollingInterval: options.pollingIntervalMs }),
  });
  return toCallsReceipt(userOpHash, receipt);
}

/** One place both the blocking and polling reads flatten the bundler's envelope. */
function toCallsReceipt(
  userOpHash: Hash,
  receipt: {
    readonly success: boolean;
    readonly actualGasCost: bigint;
    readonly logs?: readonly { address: string; topics: readonly string[]; data: string }[];
    readonly receipt: {
      readonly transactionHash: Hash;
      readonly blockNumber: bigint;
      readonly gasUsed?: bigint;
    };
  },
): CallsReceipt {
  return {
    userOpHash,
    transactionHash: receipt.receipt.transactionHash,
    success: receipt.success,
    blockNumber: receipt.receipt.blockNumber,
    actualGasCostWei: receipt.actualGasCost,
    gasUsed: receipt.receipt.gasUsed ?? 0n,
    logs: (receipt.logs ?? []).map((log) => ({
      address: log.address,
      topics: [...log.topics],
      data: log.data,
    })),
  };
}
