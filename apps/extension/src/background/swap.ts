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

const DEFAULT_SLIPPAGE = 0.005;
const TOKEN_LIMIT = 50;
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
      const request = {
        chainId: network.chain.id,
        fromAddress: from,
        fromToken: fromToken ?? EVM_NATIVE_ADDRESS,
        toToken: toToken ?? EVM_NATIVE_ADDRESS,
        fromAmount,
        slippage: DEFAULT_SLIPPAGE,
      };
      try {
        return await backend.swapQuote(request);
      } catch {
        return directLifi.quote(request);
      }
    }

    if (network.kind === ChainKind.Solana) {
      const request = {
        fromAddress: from,
        fromToken: fromToken ?? NATIVE_SOL_MINT,
        toToken: toToken ?? NATIVE_SOL_MINT,
        fromAmount,
        slippage: DEFAULT_SLIPPAGE,
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
      return executeSolana(requireSolana(network), execution, signer.sign);
    }
    return executeEvm(requireEvm(network), signer, execution, smartAccounts);
  }

  return { tokens, getQuote, execute };
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

  // Does the router still need an allowance?
  let approvalData: Hex | null = null;
  if (approval) {
    const amount = BigInt(approval.amount);
    const allowance = await client.readContract({
      address: approval.token as Address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, approval.spender as Address],
    });
    if (allowance < amount) {
      approvalData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [approval.spender as Address, amount],
      });
    }
  }

  /**
   * On a smart account, approve and swap go out as one atomic User Operation.
   * This is the reason account abstraction is worth having in a wallet at all:
   * as two separate transactions, the approval can land while the swap fails,
   * leaving the router with a standing allowance over the user's tokens and
   * the user with nothing to show for it. Batched, either both happen or
   * neither does — and it costs one confirmation instead of two.
   */
  if (await smartAccounts.canBatch(evm, signer)) {
    const calls: Call[] = [];
    if (approvalData && approval) {
      calls.push({ to: approval.token as Address, data: approvalData });
    }
    calls.push({
      to: swapTx.to as Address,
      value: BigInt(swapTx.value),
      data: swapTx.data as Hex,
    });
    const batched = await smartAccounts.executeCalls(evm, signer, calls);
    return { hash: batched, explorerUrl: txExplorerUrl(evm, batched) };
  }

  // Plain EOA: the approval must be mined before the swap can use it.
  if (approvalData && approval) {
    const approveHash = await signEvm(client, owner, approval.token, approvalData, 0n, signer.sign);
    await client.waitForTransactionReceipt({ hash: approveHash });
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
  execution: SolanaSwapExecutionData,
  signWith: SignWith,
): Promise<SendResult> {
  const connection = createSolanaClient(solana.rpcUrl);
  const transaction = VersionedTransaction.deserialize(
    Buffer.from(execution.transactionBase64, "base64"),
  );
  const signed = (await signWith((privateKey) =>
    signSolanaTx(privateKey, transaction),
  )) as VersionedTransaction;
  const hash = await broadcastSolanaTx(connection, signed);
  return { hash, explorerUrl: txExplorerUrl(solana, hash) };
}
