import { PublicKey } from "@solana/web3.js";
import type { Connection, Transaction, TransactionSignature } from "@solana/web3.js";
import type { ChainAdapter, ChainTypes, NativeSendRequest } from "@openwallet/core";
import { InvalidAddressError } from "@openwallet/core";
import { isValidAddress } from "./validate.js";
import { buildNativeTransfer, broadcastTransaction } from "./transfer.js";
import { getFeeTiers } from "./fee-tiers.js";
import { signTransaction, signMessage as signSolanaMessage } from "./sign.js";
import { getNativeBalance as readNativeBalance } from "./balance.js";
import { getSplTokenBalance, buildSplTransfer } from "./spl-token.js";
import type { FeeTiers, SplTransferParams } from "./types.js";

/** The concrete chain types for the Solana adapter — the payload of `ChainAdapter<SolanaChainTypes>`. */
export interface SolanaChainTypes extends ChainTypes {
  UnsignedTx: Transaction;
  SignedTx: Transaction;
  Fees: FeeTiers;
  BroadcastResult: TransactionSignature;
  Message: Uint8Array;
  MessageSignature: Uint8Array;
  TokenTransferParams: SplTransferParams;
}

/**
 * Wraps this package's standalone functions in the chain-agnostic
 * `ChainAdapter` contract, delegating every operation to the existing
 * `transfer`/`fee-tiers`/`sign`/`balance`/`spl-token` functions rather than
 * reimplementing them.
 *
 * `from`/`to`/`token`/`owner` arrive as plain `string`s but the builders
 * expect a `PublicKey`, so they cross the boundary through `new PublicKey`,
 * which validates the base58 and throws on a bad address rather than casting.
 * `amount` (a base-unit `bigint`) becomes `lamports: Number(amount)` — SOL
 * amounts stay well under 2^53.
 */
export function createSolanaAdapter(connection: Connection): ChainAdapter<SolanaChainTypes> {
  return {
    id: "solana",
    isValidAddress,
    validate(request: NativeSendRequest): void {
      if (!isValidAddress(request.from)) {
        throw new InvalidAddressError(`Invalid sender address: "${request.from}"`);
      }
      if (!isValidAddress(request.to)) {
        throw new InvalidAddressError(`Invalid recipient address: "${request.to}"`);
      }
    },
    async buildTransfer(request): Promise<Transaction> {
      // `amount` is already in integer base units (lamports), so there are no
      // decimals to lose — the hazard of the bigint→number narrowing is
      // magnitude: above Number.MAX_SAFE_INTEGER (≈9e15 lamports, ~9M SOL,
      // well within the total SOL supply) integers are no longer exactly
      // representable, so reject instead of silently rounding.
      const lamports = Number(request.amount);
      if (!Number.isSafeInteger(lamports)) {
        throw new RangeError(
          `Transfer amount ${request.amount.toString()} lamports is not exactly representable as a number`,
        );
      }
      return buildNativeTransfer(connection, {
        from: new PublicKey(request.from),
        to: new PublicKey(request.to),
        lamports,
      });
    },
    estimateFees(): Promise<FeeTiers> {
      return getFeeTiers(connection);
    },
    sign(unsigned, privateKey): Transaction {
      return signTransaction(privateKey, unsigned);
    },
    broadcast(signed): Promise<TransactionSignature> {
      return broadcastTransaction(connection, signed);
    },
    getNativeBalance(address): Promise<bigint> {
      return readNativeBalance(connection, new PublicKey(address));
    },
    signMessage(message, privateKey): Uint8Array {
      return signSolanaMessage(privateKey, message);
    },
    tokens: {
      getBalance(token, owner): Promise<bigint> {
        return getSplTokenBalance(connection, new PublicKey(token), new PublicKey(owner));
      },
      buildTransfer(params): Promise<Transaction> {
        return buildSplTransfer(connection, params);
      },
    },
  };
}
