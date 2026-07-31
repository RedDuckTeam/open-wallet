import { ed25519 } from "@noble/curves/ed25519.js";
import { HdKeyring, generateMnemonic } from "@openwallet/core";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { solanaCoin } from "../src/coin.js";
import { signMessage, signTransaction } from "../src/sign.js";

// SLIP-0010 correctness itself is pinned by the spec test vector in
// @openwallet/core; these tests only check that the Solana wiring (path,
// address encoding, signing) is consistent and produces verifiable output.

describe("solanaCoin", () => {
  it("derives a valid base58 address matching its own public key", () => {
    const account = HdKeyring.fromMnemonic(generateMnemonic()).deriveAccount(solanaCoin, 0);
    expect(account.path).toBe("m/44'/501'/0'/0'");
    expect(new PublicKey(account.publicKey).toBase58()).toBe(account.address);
  });

  it("derives distinct addresses per account index", () => {
    const keyring = HdKeyring.fromMnemonic(generateMnemonic());
    const first = keyring.deriveAccount(solanaCoin, 0);
    const second = keyring.deriveAccount(solanaCoin, 1);
    expect(first.address).not.toBe(second.address);
  });
});

describe("signMessage", () => {
  it("produces a signature that verifies against the derived public key", () => {
    const account = HdKeyring.fromMnemonic(generateMnemonic()).deriveAccount(solanaCoin, 0);
    const message = new TextEncoder().encode("hello openwallet");
    const signature = signMessage(account.privateKey, message);
    expect(ed25519.verify(signature, message, account.publicKey)).toBe(true);
  });
});

describe("signTransaction", () => {
  it("signs a transfer so the network would accept its signature", () => {
    const account = HdKeyring.fromMnemonic(generateMnemonic()).deriveAccount(solanaCoin, 0);
    const recipient = HdKeyring.fromMnemonic(generateMnemonic()).deriveAccount(solanaCoin, 0);

    const transaction = new Transaction({
      feePayer: new PublicKey(account.publicKey),
      blockhash: PublicKey.default.toBase58(),
      lastValidBlockHeight: 0,
    }).add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(account.publicKey),
        toPubkey: new PublicKey(recipient.publicKey),
        lamports: 1_000_000,
      }),
    );

    signTransaction(account.privateKey, transaction);

    expect(transaction.signatures).toHaveLength(1);
    expect(transaction.verifySignatures()).toBe(true);
  });
});
