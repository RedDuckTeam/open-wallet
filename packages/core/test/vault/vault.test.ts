import { bytesToHex, randomBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { utf8ToBytes } from "../../src/crypto/bytes.js";
import { deriveKey } from "../../src/crypto/kdf.js";
import { DEFAULT_KDF_PARAMS } from "../../src/crypto/constants.js";
import { encrypt } from "../../src/crypto/vault-crypto.js";
import { Vault } from "../../src/vault/vault.js";
import { VaultUnlockError } from "../../src/vault/errors.js";
import type { ImportedKeyRecord, SeedRecord } from "../../src/vault/types.js";

const IMPORTED_KEY: ImportedKeyRecord = {
  coinId: "evm",
  address: "0xabc",
  privateKey: "aa".repeat(32),
};

const SEED: SeedRecord = {
  id: "seed-1",
  mnemonic: "test test test test test test test test test test test junk",
  name: "Trading",
};

describe("Vault", () => {
  it("round-trips a mnemonic through create -> serialize -> deserialize -> unlock", async () => {
    const { vault, mnemonic } = await Vault.create("correct horse battery staple");
    const restored = Vault.deserialize(vault.serialize());
    const secrets = await restored.unlock("correct horse battery staple");

    expect(secrets.mnemonic).toBe(mnemonic);
    expect(secrets.seeds).toEqual([]);
    expect(secrets.importedKeys).toEqual([]);
  });

  it("rejects the wrong password instead of silently returning garbage", async () => {
    const { vault } = await Vault.create("correct horse battery staple");
    await expect(vault.unlock("wrong password")).rejects.toThrow(VaultUnlockError);
  });

  it("rejects a tampered ciphertext", async () => {
    const { vault } = await Vault.create("correct horse battery staple");
    const serialized = vault.serialize();
    const tampered = Vault.deserialize({
      ...serialized,
      ciphertext:
        serialized.ciphertext.slice(0, -2) + (serialized.ciphertext.endsWith("00") ? "ff" : "00"),
    });
    await expect(tampered.unlock("correct horse battery staple")).rejects.toThrow(VaultUnlockError);
  });

  it("rejects an unsupported vault version", () => {
    expect(() =>
      Vault.deserialize({
        version: 2 as unknown as 1,
        kdf: { algorithm: "scrypt", N: 1, r: 1, p: 1, salt: "00" },
        nonce: "00",
        ciphertext: "00",
      }),
    ).toThrow(/Unsupported vault version/);
  });

  it("throws VaultUnlockError, not a raw parse error, for a payload that decrypts to non-JSON", async () => {
    // Fabricates a *correctly* authenticated ciphertext (real key, real GCM
    // tag) whose plaintext just isn't JSON — the one failure mode that
    // sits after decryption succeeds, to prove it's covered by the same
    // catch as a wrong password instead of leaking a raw SyntaxError.
    const password = "password";
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt, DEFAULT_KDF_PARAMS);
    const { nonce, ciphertext } = encrypt(key, utf8ToBytes("this is not json"));

    const vault = Vault.deserialize({
      version: 1,
      kdf: { algorithm: "scrypt", ...DEFAULT_KDF_PARAMS, salt: bytesToHex(salt) },
      nonce: bytesToHex(nonce),
      ciphertext: bytesToHex(ciphertext),
    });

    await expect(vault.unlock(password)).rejects.toThrow(VaultUnlockError);
  });
});

describe("Vault.changePassword", () => {
  it("unlocks under the new password, not the old one, and keeps the same secrets", async () => {
    const { vault, mnemonic } = await Vault.create("old password");
    const withImportedKey = await vault.addImportedKey("old password", IMPORTED_KEY);

    const reencrypted = await withImportedKey.changePassword("old password", "new password");

    await expect(reencrypted.unlock("old password")).rejects.toThrow(VaultUnlockError);
    const secrets = await reencrypted.unlock("new password");
    expect(secrets.mnemonic).toBe(mnemonic);
    expect(secrets.importedKeys).toEqual([IMPORTED_KEY]);
  });

  it("does not mutate the original vault", async () => {
    const { vault } = await Vault.create("old password");
    await vault.changePassword("old password", "new password");
    await expect(vault.unlock("old password")).resolves.toBeDefined();
  });

  it("rejects the wrong old password", async () => {
    const { vault } = await Vault.create("old password");
    await expect(vault.changePassword("wrong password", "new password")).rejects.toThrow(
      VaultUnlockError,
    );
  });
});

describe("Vault.addImportedKey", () => {
  it("adds a record retrievable via unlock, without touching the mnemonic", async () => {
    const { vault, mnemonic } = await Vault.create("password");
    const withKey = await vault.addImportedKey("password", IMPORTED_KEY);

    const secrets = await withKey.unlock("password");
    expect(secrets.mnemonic).toBe(mnemonic);
    expect(secrets.importedKeys).toEqual([IMPORTED_KEY]);
  });

  it("does not mutate the original vault", async () => {
    const { vault } = await Vault.create("password");
    await vault.addImportedKey("password", IMPORTED_KEY);
    const secrets = await vault.unlock("password");
    expect(secrets.importedKeys).toEqual([]);
  });

  it("rejects re-importing the same (coinId, address)", async () => {
    const { vault } = await Vault.create("password");
    const withKey = await vault.addImportedKey("password", IMPORTED_KEY);
    await expect(withKey.addImportedKey("password", IMPORTED_KEY)).rejects.toThrow(
      /already imported/,
    );
  });

  it("rejects the wrong password", async () => {
    const { vault } = await Vault.create("password");
    await expect(vault.addImportedKey("wrong password", IMPORTED_KEY)).rejects.toThrow(
      VaultUnlockError,
    );
  });
});

describe("Vault.removeImportedKey", () => {
  it("removes a previously imported key", async () => {
    const { vault } = await Vault.create("password");
    const withKey = await vault.addImportedKey("password", IMPORTED_KEY);
    const withoutKey = await withKey.removeImportedKey(
      "password",
      IMPORTED_KEY.coinId,
      IMPORTED_KEY.address,
    );

    const secrets = await withoutKey.unlock("password");
    expect(secrets.importedKeys).toEqual([]);
  });

  it("is a no-op when the key isn't present", async () => {
    const { vault } = await Vault.create("password");
    const result = await vault.removeImportedKey("password", "evm", "0xnotthere");
    const secrets = await result.unlock("password");
    expect(secrets.importedKeys).toEqual([]);
  });
});

describe("Vault.addSeed", () => {
  it("adds a seed retrievable via unlock, without touching the primary mnemonic", async () => {
    const { vault, mnemonic } = await Vault.create("password");
    const withSeed = await vault.addSeed("password", SEED);

    const secrets = await withSeed.unlock("password");
    expect(secrets.mnemonic).toBe(mnemonic);
    expect(secrets.seeds).toEqual([SEED]);
  });

  it("does not mutate the original vault", async () => {
    const { vault } = await Vault.create("password");
    await vault.addSeed("password", SEED);
    const secrets = await vault.unlock("password");
    expect(secrets.seeds).toEqual([]);
  });

  it("rejects a duplicate seed id", async () => {
    const { vault } = await Vault.create("password");
    const withSeed = await vault.addSeed("password", SEED);
    await expect(withSeed.addSeed("password", SEED)).rejects.toThrow(/already exists/);
  });

  it("rejects the wrong password", async () => {
    const { vault } = await Vault.create("password");
    await expect(vault.addSeed("wrong password", SEED)).rejects.toThrow(VaultUnlockError);
  });
});

describe("Vault.removeSeed", () => {
  it("removes a previously added seed", async () => {
    const { vault } = await Vault.create("password");
    const withSeed = await vault.addSeed("password", SEED);
    const withoutSeed = await withSeed.removeSeed("password", SEED.id);

    const secrets = await withoutSeed.unlock("password");
    expect(secrets.seeds).toEqual([]);
  });

  it("is a no-op when the seed isn't present", async () => {
    const { vault } = await Vault.create("password");
    const result = await vault.removeSeed("password", "not-there");
    const secrets = await result.unlock("password");
    expect(secrets.seeds).toEqual([]);
  });
});
