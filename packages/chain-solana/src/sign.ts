import { ed25519 } from "@noble/curves/ed25519.js";
import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";

function keypairFor(privateKey: Uint8Array): Keypair {
  return Keypair.fromSeed(privateKey);
}

export function signTransaction<T extends Transaction | VersionedTransaction>(
  privateKey: Uint8Array,
  transaction: T,
): T {
  const keypair = keypairFor(privateKey);
  if (transaction instanceof VersionedTransaction) {
    transaction.sign([keypair]);
  } else {
    transaction.sign(keypair);
  }
  return transaction;
}

export function signMessage(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey);
}
