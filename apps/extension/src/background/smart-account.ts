import {
  createEvmClient,
  createSmartAccountSession,
  getCallsReceipt,
  getSmartAccountInfo,
  prepareCalls,
  revokeDelegation,
  sendCalls,
  smartAccountProvider,
  waitForCalls,
  type Call,
  type CallsReceipt,
  type EvmSigner,
  type PreparedCalls,
  type SmartAccountInfo,
  type SmartAccountKind,
  type SmartAccountSession,
} from "@openwallet/chain-evm";
import { ChainKind } from "../messaging/protocol.js";
import { rpcEndpoint, type EvmNetwork, type NetworkConfig } from "../config/networks.js";
import type { ActiveSigner } from "./active-signer.js";
import type { SettingsService } from "./services/settings-service.js";

/**
 * The platform's seam onto ERC-4337, the counterpart of `chains.ts` for the
 * smart-account path. It owns bundler configuration, session caching, and
 * the "is this even possible here" question; everything below it is
 * chain-evm's `aa/` layer, and everything above it deals in plain views.
 *
 * Deliberately separate from `ChainService` rather than folded into it: the
 * chain service drives the *chain-agnostic* adapter contract that Solana and
 * Bitcoin also implement, and User Operations exist on neither. Merging them
 * would put an EVM-only branch inside the one abstraction whose whole job is
 * to not have any.
 */
export interface SmartAccountService {
  /**
   * Whether User Operations can run on this network at all: an EVM chain
   * with a bundler configured. Unlike an RPC there's no public bundler to
   * fall back to, so this is a genuine capability question — it's what the
   * dApp-facing EIP-5792 capability check and the UI both read.
   */
  isSupported(network: NetworkConfig): boolean;
  status(network: NetworkConfig, signer: ActiveSigner): Promise<SmartAccountInfo>;
  /** Builds and prices a batch without signing it — see chain-evm's `prepareCalls`. */
  prepare(
    network: NetworkConfig,
    signer: ActiveSigner,
    calls: readonly Call[],
  ): Promise<PreparedCalls>;
  /** Signs and submits a previously prepared batch, returning the User Operation hash. */
  send(network: NetworkConfig, signer: ActiveSigner, prepared: PreparedCalls): Promise<string>;
  /**
   * Whether this account can execute a batch on this network *right now*.
   *
   * True only for an EIP-7702 account already delegated to our
   * implementation. Deliberately false for counterfactual kinds even when
   * they're deployed: there the smart account is a different address holding
   * its own funds, so routing the user's Send through it would spend a
   * balance that isn't the one shown on screen.
   */
  canBatch(network: NetworkConfig, signer: ActiveSigner): Promise<boolean>;
  /**
   * Runs calls atomically as one User Operation and returns the hash of the
   * transaction that carried it — not the User Operation hash, so callers can
   * link to a block explorer like any other send.
   */
  executeCalls(
    network: NetworkConfig,
    signer: ActiveSigner,
    calls: readonly Call[],
  ): Promise<string>;
  /** Clears an EIP-7702 delegation, returning the account to a plain EOA. */
  revoke(network: NetworkConfig, signer: ActiveSigner): Promise<string>;
  wait(network: NetworkConfig, signer: ActiveSigner, userOpHash: string): Promise<CallsReceipt>;
  /** The receipt if the bundler has one, or null while the operation is in flight. */
  receipt(
    network: NetworkConfig,
    signer: ActiveSigner,
    userOpHash: string,
  ): Promise<CallsReceipt | null>;
}

/**
 * An `ActiveSigner` is already "an address plus a way to borrow its key";
 * `EvmSigner` is the same idea named in chain-evm's vocabulary. Adapting
 * here rather than making `ActiveSigner` implement `EvmSigner` directly
 * keeps the extension's signer free of any one chain package's types — the
 * same signer also drives Solana and Bitcoin sends.
 */
function toEvmSigner(signer: ActiveSigner): EvmSigner {
  return {
    address: signer.address as EvmSigner["address"],
    publicKey: signer.publicKey,
    withPrivateKey: (fn) => signer.withPrivateKey(fn),
  };
}

export function createSmartAccountService(settings: SettingsService): SmartAccountService {
  // Sessions are cached because building one costs a round-trip for a
  // counterfactual account's address. Instance state, not a module-level
  // map: a cache keyed on user-controlled settings that outlives the service
  // it belongs to is how stale RPC/bundler endpoints survive a settings change.
  const sessions = new Map<string, Promise<SmartAccountSession>>();

  function isSupported(network: NetworkConfig): boolean {
    return network.kind === ChainKind.Evm && settings.bundlerUrl(network) !== null;
  }

  function requireEvm(network: NetworkConfig): EvmNetwork {
    if (network.kind !== ChainKind.Evm) {
      throw new Error(`${network.name} doesn't support smart accounts`);
    }
    return network;
  }

  function requireBundler(network: NetworkConfig): string {
    const url = settings.bundlerUrl(network);
    if (!url) {
      throw new Error(`No ERC-4337 bundler is configured for ${network.name}`);
    }
    return url;
  }

  // Every input that changes what the session *is* belongs in the key —
  // endpoint and bundler so a settings change takes effect, kind so
  // switching implementations doesn't keep signing through the old one, and
  // address so two accounts never share a session.
  function cacheKey(
    network: NetworkConfig,
    signer: ActiveSigner,
    kind: SmartAccountKind,
    bundlerUrl: string,
  ): string {
    return `${network.id}@${rpcEndpoint(network)}|${bundlerUrl}|${kind}|${signer.address}`;
  }

  function sessionFor(network: NetworkConfig, signer: ActiveSigner): Promise<SmartAccountSession> {
    const evm = requireEvm(network);
    const bundlerUrl = requireBundler(evm);
    const kind = settings.smartAccountKind();
    const key = cacheKey(evm, signer, kind, bundlerUrl);

    let session = sessions.get(key);
    if (!session) {
      const paymasterUrl = settings.paymasterUrl(evm);
      session = createSmartAccountSession({
        client: createEvmClient(evm.rpcUrl, evm.chain),
        signer: toEvmSigner(signer),
        provider: smartAccountProvider(kind),
        bundler: { url: bundlerUrl, ...(paymasterUrl !== null && { paymasterUrl }) },
      });
      // Cached as a promise so concurrent callers share one in-flight build
      // instead of racing to create two sessions for the same account. A
      // rejected build is evicted, so a transient RPC failure isn't sticky.
      session.catch(() => sessions.delete(key));
      sessions.set(key, session);
    }
    return session;
  }

  return {
    isSupported,
    async status(network, signer): Promise<SmartAccountInfo> {
      return getSmartAccountInfo(await sessionFor(network, signer));
    },
    async canBatch(network, signer): Promise<boolean> {
      if (!isSupported(network)) return false;
      try {
        const info = await getSmartAccountInfo(await sessionFor(network, signer));
        if (!info.sharesOwnerAddress) return false;
        return info.delegatedTo !== null && info.delegatedTo === info.implementation;
      } catch {
        // An unreachable bundler or RPC means "not right now", and the caller
        // falls back to a plain transaction rather than failing the send.
        return false;
      }
    },
    async executeCalls(network, signer, calls): Promise<string> {
      const session = await sessionFor(network, signer);
      const prepared = await prepareCalls(session, calls);
      const userOpHash = await sendCalls(session, prepared);
      const receipt = await waitForCalls(session, userOpHash);
      // A User Operation can be mined inside a perfectly successful bundle and
      // still have reverted internally, so the send is only a success if the
      // operation itself was.
      if (!receipt.success) throw new Error("The operation reverted on-chain");
      return receipt.transactionHash;
    },
    async revoke(network, signer): Promise<string> {
      const evm = requireEvm(network);
      // Sessions are keyed partly on the smart-account kind, and revocation
      // changes what this account *is*, so the cached one is dropped.
      sessions.clear();
      return revokeDelegation(createEvmClient(evm.rpcUrl, evm.chain), toEvmSigner(signer));
    },
    async prepare(network, signer, calls): Promise<PreparedCalls> {
      return prepareCalls(await sessionFor(network, signer), calls);
    },
    async send(network, signer, prepared): Promise<string> {
      return sendCalls(await sessionFor(network, signer), prepared);
    },
    async wait(network, signer, userOpHash): Promise<CallsReceipt> {
      return waitForCalls(await sessionFor(network, signer), userOpHash as `0x${string}`);
    },
    async receipt(network, signer, userOpHash): Promise<CallsReceipt | null> {
      return getCallsReceipt(await sessionFor(network, signer), userOpHash as `0x${string}`);
    },
  };
}
