import {
  type Account,
  TokenAccountNotFoundError,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { Transaction, type Connection, type PublicKey } from "@solana/web3.js";
import type { SplTransferParams } from "./types.js";

async function getTokenAccountOrNull(
  connection: Connection,
  address: PublicKey,
): Promise<Account | null> {
  try {
    return await getAccount(connection, address);
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError) {
      return null;
    }
    throw error;
  }
}

/** SPL token balance, in the token's base units. 0 if `owner` has never received this token (no associated token account yet) rather than an error. */
export async function getSplTokenBalance(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
): Promise<bigint> {
  const ata = await getAssociatedTokenAddress(mint, owner);
  const account = await getTokenAccountOrNull(connection, ata);
  return account?.amount ?? 0n;
}

/**
 * Builds a ready-to-sign SPL token transfer. If `to` has never held this
 * token before, its associated token account doesn't exist yet — this
 * prepends the (sender-paid) account-creation instruction rather than
 * building a transaction that would fail on-chain, since "recipient's
 * first time receiving this token" is the common case, not an edge case.
 */
export async function buildSplTransfer(
  connection: Connection,
  params: SplTransferParams,
): Promise<Transaction> {
  const [fromAta, toAta, { blockhash, lastValidBlockHeight }] = await Promise.all([
    getAssociatedTokenAddress(params.mint, params.from),
    getAssociatedTokenAddress(params.mint, params.to),
    connection.getLatestBlockhash(),
  ]);

  const transaction = new Transaction({ feePayer: params.from, blockhash, lastValidBlockHeight });

  const recipientAccount = await getTokenAccountOrNull(connection, toAta);
  if (!recipientAccount) {
    transaction.add(
      createAssociatedTokenAccountInstruction(params.from, toAta, params.to, params.mint),
    );
  }
  transaction.add(createTransferInstruction(fromAta, toAta, params.from, params.amount));

  return transaction;
}
