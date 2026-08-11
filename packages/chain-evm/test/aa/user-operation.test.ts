import type { Address, Hash, PublicClient } from "viem";
import type { UserOperation } from "viem/account-abstraction";
import { describe, expect, it, vi } from "vitest";
import {
  getCallsReceipt,
  getSmartAccountInfo,
  prepareCalls,
  sendCalls,
  userOperationMaxCost,
  waitForCalls,
  type SmartAccountSession,
} from "../../src/aa/user-operation.js";
import { SmartAccountKind } from "../../src/aa/types.js";
import { DELEGATION_PREFIX } from "../../src/aa/delegation.js";

const OWNER: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ENTRY_POINT: Address = "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108";
const USER_OP_HASH: Hash = `0x${"ab".repeat(32)}`;
const TX_HASH: Hash = `0x${"cd".repeat(32)}`;

const USER_OP = {
  sender: OWNER,
  nonce: 0n,
  callData: "0x",
  callGasLimit: 100_000n,
  verificationGasLimit: 200_000n,
  preVerificationGas: 50_000n,
  maxFeePerGas: 30_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
  signature: "0x",
} as unknown as UserOperation;

// One receipt shape shared by the blocking and polling reads, so a change to
// either can't silently diverge from the other in tests.
const RECEIPT = {
  success: true,
  actualGasCost: 7_000_000_000_000_000n,
  logs: [{ address: OWNER, topics: ["0xdead"], data: "0x" }],
  receipt: {
    transactionHash: TX_HASH,
    blockNumber: 21_000_000n,
    gasUsed: 120_000n,
    status: "success",
  },
};

interface Mocks {
  readonly prepareUserOperation: ReturnType<typeof vi.fn>;
  readonly sendUserOperation: ReturnType<typeof vi.fn>;
  readonly waitForUserOperationReceipt: ReturnType<typeof vi.fn>;
  readonly getUserOperationReceipt: ReturnType<typeof vi.fn>;
  readonly signUserOperation: ReturnType<typeof vi.fn>;
  readonly getCode: ReturnType<typeof vi.fn>;
  readonly isDeployed: ReturnType<typeof vi.fn>;
}

function mockSession(
  overrides: {
    readonly userOperation?: UserOperation;
    readonly sharesOwnerAddress?: boolean;
    readonly deployed?: boolean;
    readonly code?: string;
  } = {},
): { session: SmartAccountSession; mocks: Mocks } {
  const mocks: Mocks = {
    prepareUserOperation: vi.fn().mockResolvedValue(overrides.userOperation ?? USER_OP),
    sendUserOperation: vi.fn().mockResolvedValue(USER_OP_HASH),
    waitForUserOperationReceipt: vi.fn().mockResolvedValue(RECEIPT),
    getUserOperationReceipt: vi.fn().mockResolvedValue(RECEIPT),
    signUserOperation: vi.fn().mockResolvedValue("0xdeadbeef"),
    getCode: vi.fn().mockResolvedValue(overrides.code ?? "0x"),
    isDeployed: vi.fn().mockResolvedValue(overrides.deployed ?? false),
  };
  const session = {
    kind: SmartAccountKind.Simple7702,
    sharesOwnerAddress: overrides.sharesOwnerAddress ?? true,
    owner: OWNER,
    implementation: null,
    account: {
      getAddress: vi.fn().mockResolvedValue(OWNER),
      isDeployed: mocks.isDeployed,
      signUserOperation: mocks.signUserOperation,
      entryPoint: { address: ENTRY_POINT, version: "0.8" },
    },
    bundler: {
      prepareUserOperation: mocks.prepareUserOperation,
      sendUserOperation: mocks.sendUserOperation,
      waitForUserOperationReceipt: mocks.waitForUserOperationReceipt,
      getUserOperationReceipt: mocks.getUserOperationReceipt,
    },
    client: { getCode: mocks.getCode } as unknown as PublicClient,
  } as unknown as SmartAccountSession;
  return { session, mocks };
}

describe("userOperationMaxCost", () => {
  it("charges every gas limit at maxFeePerGas, which is what the EntryPoint holds", () => {
    expect(
      userOperationMaxCost({
        callGasLimit: 100_000n,
        verificationGasLimit: 200_000n,
        preVerificationGas: 50_000n,
        maxFeePerGas: 30_000_000_000n,
      }),
    ).toBe(350_000n * 30_000_000_000n);
  });

  it("includes the paymaster's own gas limits, so a sponsored operation isn't under-reported", () => {
    expect(
      userOperationMaxCost({
        callGasLimit: 100_000n,
        verificationGasLimit: 200_000n,
        preVerificationGas: 50_000n,
        maxFeePerGas: 30_000_000_000n,
        paymasterVerificationGasLimit: 30_000n,
        paymasterPostOpGasLimit: 20_000n,
      }),
    ).toBe(400_000n * 30_000_000_000n);
  });

  it("ignores maxPriorityFeePerGas — the prefund is computed at the max fee", () => {
    const fields = {
      callGasLimit: 1n,
      verificationGasLimit: 1n,
      preVerificationGas: 1n,
      maxFeePerGas: 100n,
    };

    expect(userOperationMaxCost(fields)).toBe(300n);
  });
});

describe("prepareCalls", () => {
  it("builds through the bundler and prices the result", async () => {
    const { session, mocks } = mockSession();

    const prepared = await prepareCalls(session, [{ to: OWNER, value: 1n }]);

    expect(mocks.prepareUserOperation).toHaveBeenCalledWith({
      account: session.account,
      calls: [{ to: OWNER, value: 1n }],
    });
    expect(prepared.userOperation).toBe(USER_OP);
    expect(prepared.fees.maxCostWei).toBe(350_000n * 30_000_000_000n);
    expect(prepared.fees.sponsored).toBe(false);
  });

  it("reports sponsorship from a v0.7+ paymaster field", async () => {
    const { session } = mockSession({
      userOperation: { ...USER_OP, paymaster: ENTRY_POINT } as unknown as UserOperation,
    });

    const prepared = await prepareCalls(session, []);

    expect(prepared.fees.sponsored).toBe(true);
  });

  it("reports sponsorship from v0.6's packed paymasterAndData", async () => {
    const { session } = mockSession({
      userOperation: { ...USER_OP, paymasterAndData: "0xabcdef" } as unknown as UserOperation,
    });

    const prepared = await prepareCalls(session, []);

    expect(prepared.fees.sponsored).toBe(true);
  });

  it("does not treat empty paymasterAndData as sponsorship", async () => {
    const { session } = mockSession({
      userOperation: { ...USER_OP, paymasterAndData: "0x" } as unknown as UserOperation,
    });

    const prepared = await prepareCalls(session, []);

    expect(prepared.fees.sponsored).toBe(false);
  });
});

describe("sendCalls", () => {
  it("signs the prepared operation and sends exactly it, with no second preparation", async () => {
    const { session, mocks } = mockSession();
    const prepared = await prepareCalls(session, [{ to: OWNER }]);
    mocks.prepareUserOperation.mockClear();

    await expect(sendCalls(session, prepared)).resolves.toBe(USER_OP_HASH);

    expect(mocks.signUserOperation).toHaveBeenCalledWith(USER_OP);
    // Passing an account back to viem would make it re-prepare — and re-price
    // — the operation after the user already approved these numbers.
    expect(mocks.sendUserOperation).toHaveBeenCalledWith({
      ...USER_OP,
      account: undefined,
      signature: "0xdeadbeef",
      entryPointAddress: ENTRY_POINT,
    });
    expect(mocks.prepareUserOperation).not.toHaveBeenCalled();
  });
});

describe("getCallsReceipt", () => {
  it("returns null while the operation is still in flight", async () => {
    const { session, mocks } = mockSession();
    mocks.getUserOperationReceipt.mockResolvedValue(null);

    // "Not settled yet" is a normal answer for a status poll, not an error.
    await expect(getCallsReceipt(session, USER_OP_HASH)).resolves.toBeNull();
    expect(mocks.getUserOperationReceipt).toHaveBeenCalledWith({ hash: USER_OP_HASH });
  });

  it("flattens the receipt the same way the blocking read does", async () => {
    const { session } = mockSession();

    await expect(getCallsReceipt(session, USER_OP_HASH)).resolves.toEqual(
      await waitForCalls(session, USER_OP_HASH),
    );
  });
});

describe("waitForCalls", () => {
  it("flattens the bundler's receipt envelope", async () => {
    const { session } = mockSession();

    await expect(waitForCalls(session, USER_OP_HASH)).resolves.toEqual({
      userOpHash: USER_OP_HASH,
      transactionHash: TX_HASH,
      success: true,
      blockNumber: 21_000_000n,
      actualGasCostWei: 7_000_000_000_000_000n,
      gasUsed: 120_000n,
      logs: [{ address: OWNER, topics: ["0xdead"], data: "0x" }],
    });
  });

  it("reports the operation's own outcome, not the bundle transaction's", async () => {
    const { session, mocks } = mockSession();
    // A reverted operation rides in a perfectly successful bundle tx.
    mocks.waitForUserOperationReceipt.mockResolvedValue({
      ...RECEIPT,
      success: false,
      receipt: { ...RECEIPT.receipt, blockNumber: 1n },
    });

    await expect(waitForCalls(session, USER_OP_HASH)).resolves.toMatchObject({ success: false });
  });

  it("passes timeout and polling through when given", async () => {
    const { session, mocks } = mockSession();

    await waitForCalls(session, USER_OP_HASH, { timeoutMs: 1_000, pollingIntervalMs: 100 });

    expect(mocks.waitForUserOperationReceipt).toHaveBeenCalledWith({
      hash: USER_OP_HASH,
      timeout: 1_000,
      pollingInterval: 100,
    });
  });
});

describe("getSmartAccountInfo", () => {
  it("reads the delegation for an EIP-7702 account", async () => {
    const { session, mocks } = mockSession({
      deployed: true,
      code: `${DELEGATION_PREFIX}e6cae83bde06e4c305530e199d7217f42808555b`,
    });

    const info = await getSmartAccountInfo(session);

    expect(info).toMatchObject({
      kind: SmartAccountKind.Simple7702,
      address: OWNER,
      owner: OWNER,
      sharesOwnerAddress: true,
      deployed: true,
      delegatedTo: "0xe6Cae83BdE06E4c305530e199D7217f42808555B",
      entryPoint: ENTRY_POINT,
      entryPointVersion: "0.8",
    });
    expect(mocks.getCode).toHaveBeenCalledWith({ address: OWNER });
  });

  it("reports our implementation next to the current one, so 'upgraded elsewhere' is distinguishable", async () => {
    // An EOA the user upgraded with a different wallet: delegated, but not
    // to a contract this wallet knows how to drive.
    const { session } = mockSession({
      deployed: true,
      code: `${DELEGATION_PREFIX}70997970c51812dc3a010c7d01b50e0d17dc79c8`,
    });
    const ours: Address = "0xe6Cae83BdE06E4c305530e199D7217f42808555B";

    const info = await getSmartAccountInfo({ ...session, implementation: ours });

    expect(info.delegatedTo).toBe("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
    expect(info.implementation).toBe(ours);
    expect(info.delegatedTo).not.toBe(info.implementation);
  });

  it("skips the delegation read for a counterfactual account, where it can only be null", async () => {
    const { session, mocks } = mockSession({ sharesOwnerAddress: false });

    const info = await getSmartAccountInfo(session);

    expect(info.delegatedTo).toBeNull();
    expect(mocks.getCode).not.toHaveBeenCalled();
  });
});
