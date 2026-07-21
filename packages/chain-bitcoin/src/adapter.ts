import { networks } from "bitcoinjs-lib";
import type { Network, Psbt } from "bitcoinjs-lib";
import type { ChainAdapter, ChainTypes, NativeSendRequest } from "@openwallet/core";
import { InvalidAddressError } from "@openwallet/core";
import { isValidAddress } from "./validate.js";
import { buildTransferPsbt } from "./transfer.js";
import { signPsbt } from "./sign.js";
import { signMessage as signBitcoinMessage } from "./message.js";
import type { Broadcaster, FeeRateSource, UtxoProvider } from "./providers.js";

/**
 * The concrete chain types for the Bitcoin adapter. `TokenTransferParams` is
 * `never` and the adapter omits the `tokens` capability entirely — Bitcoin
 * has no token layer, so the absence is honest and typed (`tokens ===
 * undefined`), not a stubbed-out method.
 */
export interface BitcoinChainTypes extends ChainTypes {
  UnsignedTx: Psbt;
  SignedTx: Psbt;
  Fees: number;
  BroadcastResult: string;
  Message: string;
  MessageSignature: string;
  TokenTransferParams: never;
}

/**
 * What the Bitcoin adapter needs injected. UTXO source, fee rate, and
 * broadcast are platform choices this package doesn't hardcode (unlike the
 * EVM/Solana RPC clients); `changeAddress` defaults to the sender and
 * `network` to mainnet.
 */
export interface BitcoinAdapterDeps {
  utxoProvider: UtxoProvider;
  feeRateSource: FeeRateSource;
  broadcaster: Broadcaster;
  changeAddress?: string;
  network?: Network;
}

/**
 * Wraps this package's standalone functions in the chain-agnostic
 * `ChainAdapter` contract, sourcing UTXOs / fee rate / broadcast through the
 * injected providers. Signing deliberately does not finalize (a PSBT may
 * still be awaiting co-signers), so `broadcast` finalizes and extracts the
 * raw transaction before handing it to the broadcaster — the same
 * sign→finalize→extract flow the transfer tests exercise. RBF (`rbf.ts`)
 * stays a direct export, off the adapter.
 *
 * `estimateFees` returns the fee *rate* (sats/vbyte), symmetric with the
 * rate-like tiers EVM/Solana return; the absolute fee is computed inside
 * `buildTransferPsbt` from the actually-selected inputs, so this boundary
 * deliberately does not re-run coin selection to pre-estimate it.
 */
export function createBitcoinAdapter(deps: BitcoinAdapterDeps): ChainAdapter<BitcoinChainTypes> {
  const network = deps.network ?? networks.bitcoin;
  return {
    id: "bitcoin",
    // Bound to the configured network — the raw `isValidAddress` export
    // defaults to mainnet, which would wrongly reject testnet addresses on a
    // testnet-configured adapter.
    isValidAddress: (address: string): boolean => isValidAddress(address, network),
    validate(request: NativeSendRequest): void {
      if (!isValidAddress(request.from, network)) {
        throw new InvalidAddressError(`Invalid sender address: "${request.from}"`);
      }
      if (!isValidAddress(request.to, network)) {
        throw new InvalidAddressError(`Invalid recipient address: "${request.to}"`);
      }
    },
    async buildTransfer(request): Promise<Psbt> {
      const [utxos, feeRateSatsPerVbyte] = await Promise.all([
        deps.utxoProvider.listUtxos(request.from),
        deps.feeRateSource.getFeeRate(),
      ]);
      return buildTransferPsbt({
        utxos,
        to: request.to,
        // `amount` is already in integer base units (sats — no decimals to
        // lose), and magnitude is bounded by the 21M BTC supply ≈ 2.1e15
        // sats < 2^53, so the narrowing is exact.
        amountSats: Number(request.amount),
        changeAddress: deps.changeAddress ?? request.from,
        feeRateSatsPerVbyte,
        network,
      });
    },
    estimateFees(): Promise<number> {
      return deps.feeRateSource.getFeeRate();
    },
    sign(unsigned, privateKey): Psbt {
      return signPsbt(privateKey, unsigned);
    },
    async broadcast(signed): Promise<string> {
      signed.finalizeAllInputs();
      const rawTxHex = signed.extractTransaction().toHex();
      return deps.broadcaster.broadcast(rawTxHex);
    },
    async getNativeBalance(address): Promise<bigint> {
      const utxos = await deps.utxoProvider.listUtxos(address);
      return utxos.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n);
    },
    signMessage(message, privateKey): string {
      return signBitcoinMessage(privateKey, message);
    },
  };
}
