import { HdKeyring } from "@openwallet/core";
import {
  recoverTransactionAddress,
  recoverTypedDataAddress,
  verifyMessage,
  type Address,
} from "viem";
import { describe, expect, it } from "vitest";
import { evmCoin } from "../src/coin.js";
import { signMessage, signTransaction, signTypedData } from "../src/sign.js";

// Hardhat/Anvil's canonical dev mnemonic. Its account #0 address is one of
// the most widely published constants in the Ethereum tooling ecosystem,
// which makes it a convenient, independently-checkable ground truth.
const TEST_MNEMONIC = "test test test test test test test test test test test junk";
const EXPECTED_ADDRESS: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("evmCoin", () => {
  it("derives the well-known Hardhat account #0 address", () => {
    const account = HdKeyring.fromMnemonic(TEST_MNEMONIC).deriveAccount(evmCoin, 0);
    expect(account.address).toBe(EXPECTED_ADDRESS);
    expect(account.path).toBe("m/44'/60'/0'/0/0");
  });
});

describe("signMessage", () => {
  it("produces a signature that recovers to the signing address", async () => {
    const account = HdKeyring.fromMnemonic(TEST_MNEMONIC).deriveAccount(evmCoin, 0);
    const signature = await signMessage(account.privateKey, "hello openwallet");
    const isValid = await verifyMessage({
      address: account.address as Address,
      message: "hello openwallet",
      signature,
    });
    expect(isValid).toBe(true);
  });
});

describe("signTransaction", () => {
  it("produces a signed transaction that recovers to the signing address", async () => {
    const account = HdKeyring.fromMnemonic(TEST_MNEMONIC).deriveAccount(evmCoin, 0);
    const serialized = await signTransaction(account.privateKey, {
      chainId: 1,
      type: "eip1559",
      to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      value: 1_000_000_000_000_000n,
      maxFeePerGas: 30_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      nonce: 0,
      gas: 21_000n,
    });
    // `PrivateKeyAccount.signTransaction` types its return as the broad `Hex`
    // even though it's always a properly-typed EIP-1559 serialization; narrow
    // it back for `recoverTransactionAddress`, which wants the branded type.
    const recovered = await recoverTransactionAddress({
      serializedTransaction: serialized as `0x02${string}`,
    });
    expect(recovered).toBe(account.address);
  });
});

describe("signTypedData", () => {
  it("produces a signature that recovers to the signing address", async () => {
    const account = HdKeyring.fromMnemonic(TEST_MNEMONIC).deriveAccount(evmCoin, 0);
    const typedData = {
      domain: { name: "openwallet", version: "1", chainId: 1 },
      types: { Mail: [{ name: "contents", type: "string" }] },
      primaryType: "Mail",
      message: { contents: "hello openwallet" },
    } as const;

    const signature = await signTypedData(account.privateKey, typedData);
    const recovered = await recoverTypedDataAddress({ ...typedData, signature });
    expect(recovered).toBe(account.address);
  });
});
