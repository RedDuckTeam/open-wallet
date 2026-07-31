import type { Connection } from "@solana/web3.js";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { broadcastTransaction, buildNativeTransfer } from "../src/transfer.js";

// A real base58-encoded 32-byte value — Transaction.serialize() requires the
// blockhash to actually decode to 32 bytes, so a hand-typed placeholder
// string of the "right length" isn't good enough.
const FAKE_BLOCKHASH = PublicKey.default.toBase58();

function mockConnection(): {
  connection: Connection;
  sendRawTransaction: ReturnType<typeof vi.fn>;
} {
  const sendRawTransaction = vi.fn().mockResolvedValue("a-signature");
  const connection = {
    getLatestBlockhash: vi.fn().mockResolvedValue({
      blockhash: FAKE_BLOCKHASH,
      lastValidBlockHeight: 100,
    }),
    sendRawTransaction,
  } as unknown as Connection;
  return { connection, sendRawTransaction };
}

describe("buildNativeTransfer", () => {
  it("builds a transaction with a single SystemProgram transfer instruction", async () => {
    const from = Keypair.generate().publicKey;
    const to = Keypair.generate().publicKey;
    const { connection } = mockConnection();

    const transaction = await buildNativeTransfer(connection, { from, to, lamports: 1_000_000 });

    expect(transaction.feePayer).toEqual(from);
    expect(transaction.recentBlockhash).toBe(FAKE_BLOCKHASH);
    expect(transaction.instructions).toHaveLength(1);
    expect(transaction.instructions[0]?.programId).toEqual(SystemProgram.programId);
  });
});

describe("broadcastTransaction", () => {
  it("serializes the transaction and forwards it to sendRawTransaction", async () => {
    const fromKeypair = Keypair.generate();
    const to = Keypair.generate().publicKey;
    const { connection, sendRawTransaction } = mockConnection();
    const transaction = await buildNativeTransfer(connection, {
      from: fromKeypair.publicKey,
      to,
      lamports: 1_000_000,
    });
    // `from` is both the fee payer and the transfer instruction's signer, so
    // one signature is enough for serialize() to accept the transaction.
    transaction.sign(fromKeypair);

    const signature = await broadcastTransaction(connection, transaction);
    expect(signature).toBe("a-signature");
    expect(sendRawTransaction).toHaveBeenCalledOnce();
  });
});
