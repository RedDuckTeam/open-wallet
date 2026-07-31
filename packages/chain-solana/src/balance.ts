import type { Connection, PublicKey } from "@solana/web3.js";

/** Native SOL balance, in lamports. */
export async function getNativeBalance(
  connection: Connection,
  address: PublicKey,
): Promise<bigint> {
  return BigInt(await connection.getBalance(address));
}
