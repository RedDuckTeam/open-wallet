import { getAddress } from "viem";
import type {
  Hash,
  Hex,
  PublicClient,
  SignableMessage,
  TransactionSerializableEIP1559,
} from "viem";
import type { ChainAdapter, ChainTypes, NativeSendRequest } from "@openwallet/core";
import { InvalidAddressError } from "@openwallet/core";
import { isValidAddress } from "./validate.js";
import { buildNativeTransfer, broadcastTransaction } from "./transfer.js";
import { getFeeTiers } from "./fee-tiers.js";
import { signTransaction, signMessage as signEvmMessage } from "./sign.js";
import { getNativeBalance as readNativeBalance } from "./balance.js";
import { getErc20Balance, buildErc20Transfer } from "./erc20.js";
import type { Erc20TransferParams, FeeTiers } from "./types.js";

/** The concrete chain types for the EVM adapter — the payload of `ChainAdapter<EvmChainTypes>`. */
export interface EvmChainTypes extends ChainTypes {
  UnsignedTx: TransactionSerializableEIP1559;
  SignedTx: Hex;
  Fees: FeeTiers;
  BroadcastResult: Hash;
  Message: SignableMessage;
  MessageSignature: Hex;
  TokenTransferParams: Erc20TransferParams;
}

/**
 * Wraps this package's standalone functions in the chain-agnostic
 * `ChainAdapter` contract. It only adapts — every operation delegates to the
 * existing `transfer`/`fee-tiers`/`sign`/`balance`/`erc20` functions, which
 * stay the typed, chain-specific surface for callers that want it. Speed-up
 * / cancel (`replace.ts`) and ENS (`ens.ts`) are intentionally left off the
 * adapter as chain-specific extras, exported directly instead.
 *
 * `from`/`to`/`token`/`owner` arrive as plain `string`s but viem's builders
 * expect a branded `Address`, so they cross the boundary through viem's
 * `getAddress`, which validates (checksum included) and throws on a bad
 * address rather than casting.
 */
export function createEvmAdapter(client: PublicClient): ChainAdapter<EvmChainTypes> {
  return {
    id: "evm",
    isValidAddress,
    validate(request: NativeSendRequest): void {
      if (!isValidAddress(request.from)) {
        throw new InvalidAddressError(`Invalid sender address: "${request.from}"`);
      }
      if (!isValidAddress(request.to)) {
        throw new InvalidAddressError(`Invalid recipient address: "${request.to}"`);
      }
    },
    buildTransfer(request): Promise<TransactionSerializableEIP1559> {
      return buildNativeTransfer(client, {
        from: getAddress(request.from),
        to: getAddress(request.to),
        value: request.amount,
      });
    },
    estimateFees(): Promise<FeeTiers> {
      return getFeeTiers(client);
    },
    sign(unsigned, privateKey): Promise<Hex> {
      return signTransaction(privateKey, unsigned);
    },
    broadcast(signed): Promise<Hash> {
      return broadcastTransaction(client, signed);
    },
    getNativeBalance(address): Promise<bigint> {
      return readNativeBalance(client, getAddress(address));
    },
    signMessage(message, privateKey): Promise<Hex> {
      return signEvmMessage(privateKey, message);
    },
    tokens: {
      getBalance(token, owner): Promise<bigint> {
        return getErc20Balance(client, getAddress(token), getAddress(owner));
      },
      buildTransfer(params): Promise<TransactionSerializableEIP1559> {
        return buildErc20Transfer(client, params);
      },
    },
  };
}
