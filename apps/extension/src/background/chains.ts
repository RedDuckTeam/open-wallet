import { address as bitcoinAddress } from "bitcoinjs-lib";
import type { Address, PublicClient } from "viem";
import type { ChainAdapter } from "@openwallet/core";
import {
  createEvmAdapter,
  createEvmClient,
  getErc20Metadata,
  isValidAddress as isValidEvmAddress,
  resolveEnsAddress,
} from "@openwallet/chain-evm";
import {
  createSolanaAdapter,
  createSolanaClient,
  isValidAddress as isValidSolanaAddress,
} from "@openwallet/chain-solana";
import {
  createBitcoinAdapter,
  isValidAddress as isValidBitcoinAddress,
  type Utxo,
} from "@openwallet/chain-bitcoin";
import { AssetKind, ChainKind } from "../messaging/protocol.js";
import { rpcEndpoint } from "../config/networks.js";
import { EsploraClient } from "./adapters/esplora.js";
import type { BitcoinNetwork, EvmNetwork, NetworkConfig } from "../config/networks.js";

export interface TokenMetadata {
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
}

// Signs with the sender's key inside the callback. The signed value is the
// adapter's erased SignedTx, so it's typed unknown here.
export type SignWith = (fn: (privateKey: Uint8Array) => unknown) => Promise<unknown>;

// A native or token transfer, amounts in base units (bigint).
export type TransferRequest =
  | {
      readonly asset: typeof AssetKind.Native;
      readonly from: string;
      readonly to: string;
      readonly amount: bigint;
    }
  | {
      readonly asset: typeof AssetKind.Token;
      readonly token: string;
      readonly from: string;
      readonly to: string;
      readonly amount: bigint;
    };

// The platform's seam onto the core chain layer. Builds a core ChainAdapter per
// network and owns the send pipe, so the erased ChainAdapter stays contained
// here and callers get a typed API. Adding a chain family touches only this file.
export type FeeIntent = "transfer" | "swap";

export interface ChainService {
  adapterFor(network: NetworkConfig): ChainAdapter;
  // validate -> build -> sign -> broadcast; returns the tx hash.
  transfer(network: NetworkConfig, request: TransferRequest, signWith: SignWith): Promise<string>;
  // Validates an address, or resolves ENS on EVM; null if neither.
  resolveRecipient(network: NetworkConfig, value: string): Promise<string | null>;
  tokenMetadata(network: NetworkConfig, token: string): Promise<TokenMetadata>;
  // Native base units to keep for gas, so "Max" on the native asset stays sendable.
  feeReserve(network: NetworkConfig, address: string, intent: FeeIntent): Promise<bigint>;
}

// EVM gas units to reserve. A plain transfer is exactly 21000; a swap varies, so
// reserve a generous ceiling (the real quote gas is usually well under this).
const EVM_TRANSFER_GAS = 21_000n;
const EVM_SWAP_GAS = 350_000n;
// Solana's per-signature base fee is 5000 lamports; reserve a small multiple.
const SOLANA_FEE_RESERVE = 10_000n;
// Rough p2wpkh vbytes: base + one output (send-all, no change) + per-input.
const BTC_BASE_VBYTES = 10;
const BTC_OUTPUT_VBYTES = 31;
const BTC_INPUT_VBYTES = 68;

function bitcoinDeps(network: BitcoinNetwork): Parameters<typeof createBitcoinAdapter>[0] {
  const esplora = new EsploraClient(network.esploraUrl);
  return {
    network: network.params,
    utxoProvider: {
      // Esplora omits the scriptPubKey witnessUtxo needs; derive it from the address.
      listUtxos: async (owner: string): Promise<readonly Utxo[]> => {
        const script = bitcoinAddress.toOutputScript(owner, network.params);
        const utxos = await esplora.utxos(owner);
        return utxos.map((utxo) => ({ ...utxo, script }));
      },
    },
    feeRateSource: { getFeeRate: () => esplora.feeRateSatsPerVbyte() },
    broadcaster: { broadcast: (rawTxHex: string) => esplora.broadcast(rawTxHex) },
  };
}

// Cache adapters/clients per (network, endpoint) so we don't reopen an RPC
// connection every call. Endpoint is in the key, so a custom-RPC change is fresh.
const adapterCache = new Map<string, ChainAdapter>();
const evmClientCache = new Map<string, PublicClient>();

function cacheKey(network: NetworkConfig): string {
  return `${network.id}@${rpcEndpoint(network)}`;
}

function evmClientFor(network: EvmNetwork): PublicClient {
  const key = cacheKey(network);
  let client = evmClientCache.get(key);
  if (!client) {
    client = createEvmClient(network.rpcUrl, network.chain);
    evmClientCache.set(key, client);
  }
  return client;
}

function buildAdapter(network: NetworkConfig): ChainAdapter {
  switch (network.kind) {
    case ChainKind.Evm:
      return createEvmAdapter(evmClientFor(network));
    case ChainKind.Solana:
      return createSolanaAdapter(createSolanaClient(network.rpcUrl));
    case ChainKind.Bitcoin:
      return createBitcoinAdapter(bitcoinDeps(network));
  }
}

function adapterFor(network: NetworkConfig): ChainAdapter {
  const key = cacheKey(network);
  let adapter = adapterCache.get(key);
  if (!adapter) {
    adapter = buildAdapter(network);
    adapterCache.set(key, adapter);
  }
  return adapter;
}

// Syntactic address check, dispatched to each chain's validator. No adapter/RPC.
function isValidAddress(network: NetworkConfig, address: string): boolean {
  switch (network.kind) {
    case ChainKind.Evm:
      return isValidEvmAddress(address);
    case ChainKind.Solana:
      return isValidSolanaAddress(address);
    case ChainKind.Bitcoin:
      return isValidBitcoinAddress(address, network.params);
  }
}

function requireTokens(adapter: ChainAdapter): NonNullable<ChainAdapter["tokens"]> {
  if (!adapter.tokens) throw new Error("This network doesn't support tokens");
  return adapter.tokens;
}

async function transfer(
  network: NetworkConfig,
  request: TransferRequest,
  signWith: SignWith,
): Promise<string> {
  const adapter = adapterFor(network);
  // validate only checks addresses; amount is unused on the token path.
  const amount = request.asset === AssetKind.Native ? request.amount : 0n;
  adapter.validate({ from: request.from, to: request.to, amount });

  // unsigned/signed are the adapter's erased tx types; the pipe is sound because
  // each step feeds the next on the same adapter.
  const unsigned =
    request.asset === AssetKind.Native
      ? await adapter.buildTransfer({ from: request.from, to: request.to, amount: request.amount })
      : await requireTokens(adapter).buildTransfer({
          token: request.token,
          from: request.from,
          to: request.to,
          amount: request.amount,
        });

  const signed = await signWith((privateKey) => adapter.sign(unsigned, privateKey));
  return String(await adapter.broadcast(signed));
}

async function resolveRecipient(network: NetworkConfig, value: string): Promise<string | null> {
  const trimmed = value.trim();
  if (isValidAddress(network, trimmed)) return trimmed;
  if (network.kind === ChainKind.Evm && trimmed.toLowerCase().endsWith(".eth")) {
    try {
      return await resolveEnsAddress(evmClientFor(network), trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

async function tokenMetadata(network: NetworkConfig, token: string): Promise<TokenMetadata> {
  if (network.kind !== ChainKind.Evm) throw new Error("This network doesn't support custom tokens");
  return getErc20Metadata(evmClientFor(network), token as Address);
}

async function feeReserve(
  network: NetworkConfig,
  address: string,
  intent: FeeIntent,
): Promise<bigint> {
  switch (network.kind) {
    case ChainKind.Evm: {
      const { maxFeePerGas } = await evmClientFor(network).estimateFeesPerGas();
      return (intent === "swap" ? EVM_SWAP_GAS : EVM_TRANSFER_GAS) * maxFeePerGas;
    }
    case ChainKind.Solana:
      return SOLANA_FEE_RESERVE;
    case ChainKind.Bitcoin: {
      const esplora = new EsploraClient(network.esploraUrl);
      const [utxos, feeRate] = await Promise.all([
        esplora.utxos(address),
        esplora.feeRateSatsPerVbyte(),
      ]);
      const vbytes = BTC_BASE_VBYTES + utxos.length * BTC_INPUT_VBYTES + BTC_OUTPUT_VBYTES;
      return BigInt(Math.ceil(feeRate * vbytes));
    }
  }
}

export function createChainService(): ChainService {
  return { adapterFor, transfer, resolveRecipient, tokenMetadata, feeReserve };
}
