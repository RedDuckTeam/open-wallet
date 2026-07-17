import { describe, expect, it } from "vitest";
import { InMemoryVaultStorage } from "../../src/vault/storage.js";

describe("InMemoryVaultStorage", () => {
  it("starts empty", async () => {
    expect(await new InMemoryVaultStorage().load()).toBeNull();
  });

  it("round-trips save -> load", async () => {
    const storage = new InMemoryVaultStorage();
    const fake = {
      version: 1 as const,
      kdf: { algorithm: "scrypt" as const, N: 1, r: 1, p: 1, salt: "00" },
      nonce: "00",
      ciphertext: "00",
    };
    await storage.save(fake);
    expect(await storage.load()).toEqual(fake);
  });

  it("clear() removes what was saved", async () => {
    const storage = new InMemoryVaultStorage();
    await storage.save({
      version: 1,
      kdf: { algorithm: "scrypt", N: 1, r: 1, p: 1, salt: "00" },
      nonce: "00",
      ciphertext: "00",
    });
    await storage.clear();
    expect(await storage.load()).toBeNull();
  });
});
