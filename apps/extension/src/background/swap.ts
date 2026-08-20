import {
  broadcastTransaction as broadcastEvmTx,
  buildTransaction,
  createEvmClient,
  signTransaction as signEvmTx,
} from "@openwallet/chain-evm";
import {
  broadcastTransaction as broadcastSolanaTx,
  createSolanaClient,
  signTransaction as signSolanaTx,
} from "@openwallet/chain-solana";
import { fetchLifiTokens, LifiClient, searchTokens } from "@openwallet/lifi-client";
import { JupiterClient, NATIVE_SOL_MINT, searchJupiterTokens } from "@openwallet/jupiter-client";
import type { EvmSwapExecutionData, SolanaSwapExecutionData } from "@openwallet/api-contract";
import { VersionedTransaction } from "@solana/web3.js";
import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import type { Call } from "@openwallet/chain-evm";
import { ChainKind } from "../messaging/protocol.js";
import {
  txExplorerUrl,
  type EvmNetwork,
  type NetworkConfig,
  type SolanaNetwork,
} from "../config/networks.js";
import type {
  SendResult,
  SwapExecutionView,
  SwapQuoteView,
  SwapTokenView,
} from "../messaging/protocol.js";
import type { SignWith } from "./chains.js";
import type { ActiveSigner } from "./active-signer.js";
import type { SmartAccountService } from "./smart-account.js";
import type { BackendClient } from "./adapters/backend.js";

const TOKEN_LIMIT = 50;
/** How long a mined approval is waited for before the swap is called off. */
const RECEIPT_TIMEOUT_MS = 120_000;
// The zero address is how EVM aggregators (LI.FI included) represent the
// native asset in a token-address field; there's no real "native" contract.
const EVM_NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000";

// A minimal shape both LI.FI's TokenInfo and Jupiter's JupiterTokenInfo
// satisfy, so one mapper covers both chain kinds' tokens() result.
interface AggregatorToken {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly logoUrl: string | null;
}

function toView(token: AggregatorToken): SwapTokenView {
  return {
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    iconUrl: token.logoUrl,
  };
}

// Owns the swap flow across both chain families it's implemented for (EVM via
// LI.FI, Solana via Jupiter). Both the token list and quotes try the backend
// first (keyed, higher rate limit, cached) and fall back to calling the
// aggregator directly if it's unreachable — both aggregators' public tiers
// work keyless, so a single backend instance being down doesn't have to take
// swaps out entirely. This service then signs and broadcasts the result
// itself: an approval (if any) + swap tx for EVM, or the aggregator's
// already-built transaction for Solana.
export interface SwapService {
  tokens(network: NetworkConfig, query: string): Promise<SwapTokenView[]>;
  getQuote(
    network: NetworkConfig,
    from: string,
    // null means "the network's native asset" — resolved to whichever
    // sentinel the active chain's aggregator expects.
    fromToken: string | null,
    toToken: string | null,
    fromAmount: string,
  ): Promise<SwapQuoteView>;
  execute(
    network: NetworkConfig,
    signer: ActiveSigner,
    execution: SwapExecutionView,
  ): Promise<SendResult>;
}

function requireEvm(network: NetworkConfig): EvmNetwork {
  if (network.kind !== ChainKind.Evm) throw new Error("Expected an EVM network");
  return network;
}

function requireSolana(network: NetworkConfig): SolanaNetwork {
  if (network.kind !== ChainKind.Solana) throw new Error("Expected a Solana network");
  return network;
}

export function createSwapService(
  backend: BackendClient,
  smartAccounts: SmartAccountService,
  /**
   * The user's slippage tolerance as a fraction (0.005 for 0.5%), read per
   * call so a change in settings applies to the very next quote. Validated
   * and sanitized by the caller — see `background/slippage.ts`.
   */
  slippage: () => number,
): SwapService {
  // Keyless: only used when the backend itself doesn't answer.
  const directLifi = new LifiClient();
  const directJupiter = new JupiterClient();

  async function tokens(network: NetworkConfig, query: string): Promise<SwapTokenView[]> {
    if (network.kind === ChainKind.Evm) {
      const list = await backend
        .searchTokens(network.chain.id, query, TOKEN_LIMIT)
        .catch(async () =>
          searchTokens(await fetchLifiTokens(network.chain.id), query, TOKEN_LIMIT),
        );
      return list.map(toView);
    }
    if (network.kind === ChainKind.Solana) {
      const list = await backend
        .searchSolanaTokens(query, TOKEN_LIMIT)
        .catch(() => searchJupiterTokens(query, TOKEN_LIMIT));
      return list.map(toView);
    }
    return [];
  }

  async function getQuote(
    network: NetworkConfig,
    from: string,
    fromToken: string | null,
    toToken: string | null,
    fromAmount: string,
  ): Promise<SwapQuoteView> {
    if (network.kind === ChainKind.Evm) {
      const src = fromToken ?? EVM_NATIVE_ADDRESS;
      const dst = toToken ?? EVM_NATIVE_ADDRESS;
      // EVM addresses are case-insensitive (checksum casing is cosmetic).
      assertDifferentTokens(src.toLowerCase(), dst.toLowerCase());
      const request = {
        chainId: network.chain.id,
        fromAddress: from,
        fromToken: src,
        toToken: dst,
        fromAmount,
        slippage: slippage(),
      };
      try {
        return await backend.swapQuote(request);
      } catch {
        return directLifi.quote(request);
      }
    }

    if (network.kind === ChainKind.Solana) {
      const src = fromToken ?? NATIVE_SOL_MINT;
      const dst = toToken ?? NATIVE_SOL_MINT;
      // Solana mints are case-sensitive base58 — compared exactly, unlike EVM.
      assertDifferentTokens(src, dst);
      const request = {
        fromAddress: from,
        fromToken: src,
        toToken: dst,
        fromAmount,
        slippage: slippage(),
      };
      try {
        return await backend.solanaSwapQuote(request);
      } catch {
        return directJupiter.quote(request);
      }
    }

    // Bitcoin has no on-chain DEX to aggregate — same-chain swaps are
    // structurally not a thing there, not just an unimplemented feature.
    throw new Error(`Swaps aren't supported on ${network.name}`);
  }

  async function execute(
    network: NetworkConfig,
    signer: ActiveSigner,
    execution: SwapExecutionView,
  ): Promise<SendResult> {
    if (execution.kind === "solana") {
      // The route becomes a transaction only now: it embeds a fresh
      // blockhash and expires with it in about a minute, so it is built,
      // signed and broadcast in the same breath. Backend first (keyed),
      // direct Jupiter as the keyless fallback — the same policy as quoting.
      const transactionBase64 = await backend
        .buildSolanaSwap(execution.route, signer.address)
        .catch(() => directJupiter.buildSwapTransaction(execution.route, signer.address));
      return executeSolana(requireSolana(network), transactionBase64, signer.sign);
    }
    return executeEvm(requireEvm(network), signer, execution, smartAccounts);
  }

  return { tokens, getQuote, execute };
}

/**
 * Caught before the aggregator is asked: both reject a same-token swap, but
 * with messages written for their API consumers ("CIRCULAR_ARBITRAGE_IS_
 * DISABLED"), not for a person at a wallet.
 */
function assertDifferentTokens(fromToken: string, toToken: string): void {
  if (fromToken === toToken) {
    throw new Error("Pick two different tokens to swap between.");
  }
}

async function executeEvm(
  evm: EvmNetwork,
  signer: ActiveSigner,
  execution: EvmSwapExecutionData,
  smartAccounts: SmartAccountService,
): Promise<SendResult> {
  const client = createEvmClient(evm.rpcUrl, evm.chain);
  const { swapTx, approval } = execution;
  const owner = signer.address as Address;

  /**
   * What the router still needs approved, if anything. Two flavours because
   * of tokens with USDT's guard: their `approve` reverts when changing a
   * non-zero allowance directly (a defence against a known front-running
   * pattern), so a leftover partial allowance must be reset to zero before
   * the real approval — the flow LI.FI's own integration guide prescribes.
   */
  let approvalCalls: Call[] = [];
  if (approval) {
    const amount = BigInt(approval.amount);
    const token = approval.token as Address;
    const spender = approval.spender as Address;
    const allowance = await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, spender],
    });
    if (allowance < amount) {
      const approveCall = (value: bigint): Call => ({
        to: token,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [spender, value],
        }),
      });
      approvalCalls =
        allowance > 0n ? [approveCall(0n), approveCall(amount)] : [approveCall(amount)];
    }
  }

  /**
   * On a smart account, approvals and swap go out as one atomic User
   * Operation. This is the reason account abstraction is worth having in a
   * wallet at all: as separate transactions, the approval can land while the
   * swap fails, leaving the router with a standing allowance over the user's
   * tokens and the user with nothing to show for it. Batched, either all of
   * it happens or none does — and it costs one confirmation instead of up to
   * three.
   */
  if (await smartAccounts.canBatch(evm, signer)) {
    const calls: Call[] = [
      ...approvalCalls,
      { to: swapTx.to as Address, value: BigInt(swapTx.value), data: swapTx.data as Hex },
    ];
    const batched = await smartAccounts.executeCalls(evm, signer, calls);
    return { hash: batched, explorerUrl: txExplorerUrl(evm, batched) };
  }

  // Plain EOA: each approval must be mined — and verified, since a reverted
  // approval would send the swap to certain failure with a gas fee attached —
  // before the swap can draw on it.
  for (const call of approvalCalls) {
    const hash = await signEvm(client, owner, call.to, call.data ?? "0x", 0n, signer.sign);
    const receipt = await client.waitForTransactionReceipt({
      hash,
      timeout: RECEIPT_TIMEOUT_MS,
    });
    if (receipt.status !== "success") {
      throw new Error("The token approval was reverted on-chain. No swap was attempted.");
    }
  }

  const hash = await signEvm(
    client,
    owner,
    swapTx.to,
    swapTx.data,
    BigInt(swapTx.value),
    signer.sign,
    swapTx.gasLimit ? BigInt(swapTx.gasLimit) : undefined,
  );
  return { hash, explorerUrl: txExplorerUrl(evm, hash) };
}

// Builds, signs (key stays in the callback), and broadcasts one EIP-1559 tx
// via the shared chain-evm pipeline (same one evm-signer.ts uses).
async function signEvm(
  client: ReturnType<typeof createEvmClient>,
  from: Address,
  to: string,
  data: string,
  value: bigint,
  signWith: SignWith,
  gasLimit?: bigint,
): Promise<Hex> {
  const request = await buildTransaction(client, {
    from,
    to: to as Address,
    data: data as Hex,
    value,
    gas: gasLimit,
  });
  const signed = (await signWith((privateKey) => signEvmTx(privateKey, request))) as Hex;
  return broadcastEvmTx(client, signed);
}

// Jupiter already built the whole transaction (routing, wrap/unwrap SOL,
// compute budget); we only deserialize, sign, and broadcast it — no
// approval step, SPL allowances don't exist the way ERC-20's does.
async function executeSolana(
  solana: SolanaNetwork,
  transactionBase64: string,
  signWith: SignWith,
): Promise<SendResult> {
  const connection = createSolanaClient(solana.rpcUrl);
  const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, "base64"));
  const signed = (await signWith((privateKey) =>
    signSolanaTx(privateKey, transaction),
  )) as VersionedTransaction;
  const hash = await broadcastSolanaTx(connection, signed);
  return { hash, explorerUrl: txExplorerUrl(solana, hash) };
}
