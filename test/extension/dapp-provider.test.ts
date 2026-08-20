import { describe, expect, it, vi } from "vitest";
import { createProviderService } from "../../apps/extension/src/background/dapp/provider-service.js";
import type {
  ProviderService,
  RequestContext,
} from "../../apps/extension/src/background/dapp/provider-service.js";

const ORIGIN = "https://dapp.example";
const ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const CONTEXT: RequestContext = { origin: ORIGIN, name: "dApp", iconUrl: null };

// The Ethereum-mainnet network object the service falls back to; tests select
// it so `chainId` is a known 0x1.
const NETWORK = { id: "ethereum", kind: "evm", name: "Ethereum", chain: { id: 1 } };

interface Options {
  readonly connected?: boolean;
  readonly canBatch?: boolean;
  readonly supported?: boolean;
  readonly approve?: boolean;
}

interface Harness {
  readonly service: ProviderService;
  readonly approvals: { request: ReturnType<typeof vi.fn> };
  readonly smartAccounts: { send: ReturnType<typeof vi.fn> };
}

function build(options: Options = {}): Harness {
  const { connected = true, canBatch = true, supported = true, approve = true } = options;

  // Approvals: resolve by running the effect (user accepted) or reject.
  const approvals = {
    request: vi.fn((_view: unknown, run: () => Promise<unknown>) =>
      approve ? run() : Promise.reject(new Error("User rejected the request")),
    ),
  };
  const smartAccounts = {
    isSupported: vi.fn(() => supported),
    canBatch: vi.fn(() => Promise.resolve(canBatch)),
    status: vi.fn(() =>
      Promise.resolve({
        sharesOwnerAddress: true,
        delegatedTo: canBatch ? "0xe6Cae83BdE06E4c305530e199D7217f42808555B" : null,
        implementation: "0xe6Cae83BdE06E4c305530e199D7217f42808555B",
        deployed: canBatch,
      }),
    ),
    prepare: vi.fn(() =>
      Promise.resolve({ fees: { maxCostWei: 1000n, sponsored: false }, userOperation: {} }),
    ),
    send: vi.fn(() => Promise.resolve(`0x${"ab".repeat(32)}`)),
    receipt: vi.fn(() => Promise.resolve(null)),
  };

  const service = createProviderService({
    wallet: { isUnlocked: true } as never,
    settings: {
      activeNetwork: () => NETWORK,
      allNetworks: () => [NETWORK],
      activeAccountId: "hd:0",
    } as never,
    smartAccounts: smartAccounts as never,
    connections: { isConnected: () => connected } as never,
    approvals: approvals as never,
    emit: vi.fn(),
  });

  return { service, approvals, smartAccounts };
}

// resolveActiveSigner reaches into WalletService for the address; stub it.
vi.mock("../../apps/extension/src/background/active-signer.js", () => ({
  resolveActiveSigner: (): {
    address: string;
    publicKey: Uint8Array;
    sign: ReturnType<typeof vi.fn>;
    withPrivateKey: ReturnType<typeof vi.fn>;
  } => ({
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    publicKey: new Uint8Array(),
    sign: vi.fn(),
    withPrivateKey: vi.fn(),
  }),
}));

describe("wallet_getCapabilities", () => {
  it("says nothing to a site that isn't connected", async () => {
    const { service } = build({ connected: false });

    await expect(
      service.handle(CONTEXT, { method: "wallet_getCapabilities", params: [ACCOUNT] }),
    ).resolves.toEqual({});
  });

  it("refuses to answer for an address the wallet doesn't control", async () => {
    // Answering would be a claim about someone else's account.
    const { service } = build();

    await expect(
      service.handle(CONTEXT, { method: "wallet_getCapabilities", params: [OTHER] }),
    ).resolves.toEqual({});
  });

  it("reports atomic support once the account is already upgraded", async () => {
    const { service } = build({ canBatch: true });

    await expect(
      service.handle(CONTEXT, { method: "wallet_getCapabilities", params: [ACCOUNT, ["0x1"]] }),
    ).resolves.toEqual({ "0x1": { atomic: { status: "supported" } } });
  });

  it("reports `ready` when the wallet could upgrade the account on request", async () => {
    const { service } = build({ canBatch: false });

    await expect(
      service.handle(CONTEXT, { method: "wallet_getCapabilities", params: [ACCOUNT, ["0x1"]] }),
    ).resolves.toEqual({ "0x1": { atomic: { status: "ready" } } });
  });

  it("reports `unsupported` with no bundler configured", async () => {
    const { service } = build({ supported: false });

    await expect(
      service.handle(CONTEXT, { method: "wallet_getCapabilities", params: [ACCOUNT, ["0x1"]] }),
    ).resolves.toEqual({ "0x1": { atomic: { status: "unsupported" } } });
  });
});

describe("wallet_sendCalls", () => {
  const calls = [{ to: OTHER, value: "0x1" }];

  it("rejects a batch pinned to a different chain", async () => {
    const { service } = build();

    await expect(
      service.handle(CONTEXT, {
        method: "wallet_sendCalls",
        params: [{ from: ACCOUNT, chainId: "0x2105", calls }],
      }),
    ).rejects.toThrow(/chain/i);
  });

  it("refuses when no bundler is configured", async () => {
    const { service } = build({ supported: false });

    await expect(
      service.handle(CONTEXT, { method: "wallet_sendCalls", params: [{ from: ACCOUNT, calls }] }),
    ).rejects.toThrow(/not available/i);
  });

  it("refuses to act for an account other than the active one", async () => {
    const { service } = build();

    await expect(
      service.handle(CONTEXT, { method: "wallet_sendCalls", params: [{ from: OTHER, calls }] }),
    ).rejects.toThrow(/not the active account/i);
  });

  it("tells the approval screen when the batch will also upgrade the account", async () => {
    // A permanent change to the account must never be implicit.
    const { service, approvals } = build({ canBatch: false });

    await service.handle(CONTEXT, {
      method: "wallet_sendCalls",
      params: [{ from: ACCOUNT, calls }],
    });

    const view = approvals.request.mock.calls[0]?.[0] as { batch: { upgradesAccount: boolean } };
    expect(view.batch.upgradesAccount).toBe(true);
  });

  it("does not claim an upgrade when the account is already a smart account", async () => {
    const { service, approvals } = build({ canBatch: true });

    await service.handle(CONTEXT, {
      method: "wallet_sendCalls",
      params: [{ from: ACCOUNT, calls }],
    });

    const view = approvals.request.mock.calls[0]?.[0] as { batch: { upgradesAccount: boolean } };
    expect(view.batch.upgradesAccount).toBe(false);
  });

  it("returns a batch id that decodes back to the operation", async () => {
    const { service } = build();

    const result = (await service.handle(CONTEXT, {
      method: "wallet_sendCalls",
      params: [{ from: ACCOUNT, calls }],
    })) as { id: string };

    expect(result.id).toMatch(/^0x[0-9a-f]{80}$/);
  });

  it("propagates a rejection instead of sending", async () => {
    const { service, smartAccounts } = build({ approve: false });

    await expect(
      service.handle(CONTEXT, { method: "wallet_sendCalls", params: [{ from: ACCOUNT, calls }] }),
    ).rejects.toThrow();
    expect(smartAccounts.send).not.toHaveBeenCalled();
  });
});

describe("wallet_getCallsStatus", () => {
  it("rejects an id it never issued", async () => {
    const { service } = build();

    await expect(
      service.handle(CONTEXT, { method: "wallet_getCallsStatus", params: ["0xdead"] }),
    ).rejects.toThrow(/unknown batch id/i);
  });

  it("reports pending while the bundler has no receipt", async () => {
    const { service } = build();
    const { id } = (await service.handle(CONTEXT, {
      method: "wallet_sendCalls",
      params: [{ from: ACCOUNT, calls: [{ to: OTHER }] }],
    })) as { id: string };

    const status = (await service.handle(CONTEXT, {
      method: "wallet_getCallsStatus",
      params: [id],
    })) as { status: number; atomic: boolean };

    expect(status.status).toBe(100);
    expect(status.atomic).toBe(true);
  });
});
