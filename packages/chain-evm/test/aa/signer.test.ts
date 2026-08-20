import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hexToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { toOwnerAccount, type EvmSigner } from "../../src/aa/signer.js";

const PRIVATE_KEY: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ADDRESS: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const PRIVATE_KEY_BYTES = hexToBytes(PRIVATE_KEY);
const COMPRESSED_PUBLIC_KEY = secp256k1.getPublicKey(PRIVATE_KEY_BYTES, true);

function mockSigner(): { signer: EvmSigner; withPrivateKey: ReturnType<typeof vi.fn> } {
  const withPrivateKey = vi.fn(<T>(fn: (privateKey: Uint8Array) => T | Promise<T>): Promise<T> =>
    Promise.resolve(fn(PRIVATE_KEY_BYTES)),
  );
  return {
    withPrivateKey,
    signer: { address: ADDRESS, publicKey: COMPRESSED_PUBLIC_KEY, withPrivateKey } as EvmSigner,
  };
}

describe("toOwnerAccount", () => {
  it("does not touch the private key until something is actually signed", () => {
    const { signer, withPrivateKey } = mockSigner();

    const account = toOwnerAccount(signer);

    // Building the account is what viem holds for a whole session; if it
    // borrowed the key here, the key would be alive for that whole session.
    expect(withPrivateKey).not.toHaveBeenCalled();
    expect(account.address).toBe(ADDRESS);
  });

  it("decompresses the public key into the uncompressed form viem's account type carries", () => {
    const { signer } = mockSigner();

    const account = toOwnerAccount(signer);

    expect(account.publicKey).toBe(privateKeyToAccount(PRIVATE_KEY).publicKey);
    expect(account.publicKey.startsWith("0x04")).toBe(true);
  });

  it("produces the same message signature as a real private-key account", async () => {
    const { signer } = mockSigner();

    const signature = await toOwnerAccount(signer).signMessage({ message: "hello openwallet" });

    await expect(
      privateKeyToAccount(PRIVATE_KEY).signMessage({ message: "hello openwallet" }),
    ).resolves.toBe(signature);
  });

  it("produces the same typed-data signature as a real private-key account", async () => {
    const { signer } = mockSigner();
    const typedData = {
      domain: { name: "OpenWallet", version: "1", chainId: 1 },
      types: { Mail: [{ name: "contents", type: "string" }] },
      primaryType: "Mail",
      message: { contents: "batched" },
    } as const;

    const signature = await toOwnerAccount(signer).signTypedData(typedData);

    await expect(privateKeyToAccount(PRIVATE_KEY).signTypedData(typedData)).resolves.toBe(
      signature,
    );
  });

  it("signs an EIP-7702 authorization, which is what makes the account upgradeable at all", async () => {
    const { signer } = mockSigner();
    const authorization = { address: ADDRESS, chainId: 1, nonce: 0 } as const;

    const signed = await toOwnerAccount(signer).signAuthorization(authorization);

    await expect(
      privateKeyToAccount(PRIVATE_KEY).signAuthorization(authorization),
    ).resolves.toEqual(signed);
  });

  it("borrows the key once per signature and never holds it between them", async () => {
    const { signer, withPrivateKey } = mockSigner();
    const account = toOwnerAccount(signer);

    await account.signMessage({ message: "one" });
    await account.signMessage({ message: "two" });

    expect(withPrivateKey).toHaveBeenCalledTimes(2);
  });
});
