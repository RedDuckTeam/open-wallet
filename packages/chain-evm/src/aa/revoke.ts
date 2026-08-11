import { zeroAddress } from "viem";
import { prepareAuthorization } from "viem/actions";
import type { Hash, PublicClient, TransactionSerializableEIP7702 } from "viem";
import { broadcastTransaction } from "../transfer.js";
import { toOwnerAccount, type EvmSigner } from "./signer.js";

/**
 * Undoes an EIP-7702 delegation, turning the account back into a plain EOA.
 *
 * The mechanism is the same one that created the delegation, pointed at the
 * zero address: an authorization for `0x0` clears the delegation indicator, so
 * the account stops having code. A wallet that can upgrade an account but
 * never un-upgrade it is a one-way door, which is not a reasonable thing to
 * ask a user to walk through.
 *
 * This is a plain type-4 transaction, **not** a User Operation — the account
 * is being taken out of the smart-account world, so routing the revocation
 * through the machinery it's leaving would be circular (and impossible once
 * the delegation is gone).
 */
export async function revokeDelegation(client: PublicClient, signer: EvmSigner): Promise<Hash> {
  const owner = toOwnerAccount(signer);

  // `executor: "self"` is load-bearing: when the EOA both authorizes and sends
  // the transaction, the authorization's nonce must be one *ahead* of the
  // account nonce, because the transaction itself consumes the current one.
  // viem applies that offset; getting it wrong produces an authorization the
  // chain silently ignores, leaving the account still delegated.
  const authorization = await prepareAuthorization(client, {
    account: owner,
    address: zeroAddress,
    executor: "self",
  });
  const signedAuthorization = await owner.signAuthorization(authorization);

  const [nonce, fees, chainId] = await Promise.all([
    client.getTransactionCount({ address: owner.address, blockTag: "pending" }),
    client.estimateFeesPerGas(),
    client.getChainId(),
  ]);

  const transaction: TransactionSerializableEIP7702 = {
    type: "eip7702",
    chainId,
    nonce,
    to: owner.address,
    value: 0n,
    // A self-call carrying only the authorization; there is nothing to execute.
    data: "0x",
    gas: await client.estimateGas({
      account: owner.address,
      to: owner.address,
      authorizationList: [signedAuthorization],
    }),
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    authorizationList: [signedAuthorization],
  };

  const signed = await owner.signTransaction(transaction);
  return broadcastTransaction(client, signed);
}
