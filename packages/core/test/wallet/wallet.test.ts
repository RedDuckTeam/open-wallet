import { bytesToHex } from "@noble/hashes/utils.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoinEntry } from "../../src/keyring/types.js";
import { bytesToUtf8 } from "../../src/crypto/bytes.js";
import { InMemoryVaultStorage } from "../../src/vault/storage.js";
import { Wallet } from "../../src/wallet/wallet.js";
import type { WalletOptions } from "../../src/wallet/types.js";
import { IMPORTED_ACCOUNT_PATH } from "../../src/wallet/constants.js";
import { VaultUnlockError } from "../../src/vault/errors.js";

const stubCoin: CoinEntry = {
  id: "stub",
  curve: "secp256k1",
  derivationPath: (accountIndex) => `m/44'/0'/0'/0/${String(accountIndex)}`,
  deriveAddress: (publicKey) => `stub:${bytesToHex(publicKey)}`,
};

// The well-known secp256k1 generator point G — private key 1's public key —
// used as a deterministic, independently-verifiable test private key.
const TEST_PRIVATE_KEY_HEX = "1".padStart(64, "0");

function options(overrides: Partial<WalletOptions> = {}): WalletOptions {
  return { coins: [stubCoin], storage: new InMemoryVaultStorage(), ...overrides };
}

describe("Wallet.create / Wallet.open", () => {
  it("is unlocked immediately after create()", async () => {
    const { wallet } = await Wallet.create("password", options());
    expect(wallet.isUnlocked).toBe(true);
  });

  it("persists to storage so a fresh Wallet can open + unlock it", async () => {
    const storage = new InMemoryVaultStorage();
    const { wallet: created, mnemonic } = await Wallet.create("password", options({ storage }));
    const addressBefore = created.accounts.get(stubCoin.id).address;

    const reopened = await Wallet.open(options({ storage }));
    expect(reopened.isUnlocked).toBe(false);
    await reopened.unlock("password");
    expect(reopened.accounts.get(stubCoin.id).address).toBe(addressBefore);
    expect(mnemonic.split(" ")).toHaveLength(12);
  });

  it("refuses to create a second wallet over an existing one", async () => {
    const storage = new InMemoryVaultStorage();
    await Wallet.create("password", options({ storage }));
    await expect(Wallet.create("password", options({ storage }))).rejects.toThrow(/already exists/);
  });

  it("open() without a stored vault fails", async () => {
    await expect(Wallet.open(options())).rejects.toThrow(/No vault found/);
  });

  it("rejects duplicate coin ids at construction", () => {
    expect(() => new Wallet(options({ coins: [stubCoin, stubCoin] }))).toThrow(/Duplicate coin id/);
  });
});

describe("Wallet.import", () => {
  it("derives the same accounts as the original wallet", async () => {
    const { mnemonic } = await Wallet.create("password", options());
    const imported = await Wallet.import(mnemonic, "password", options());
    const account = imported.accounts.get(stubCoin.id);
    expect(account.address).toBe(`stub:${bytesToHex(account.publicKey)}`);
  });

  it("rejects an invalid mnemonic without persisting anything to storage", async () => {
    const storage = new InMemoryVaultStorage();
    await expect(
      Wallet.import("not a real mnemonic phrase at all", "password", options({ storage })),
    ).rejects.toThrow(/Invalid mnemonic/);

    // Confirms this failed *before* touching storage: a wallet can still be
    // created fresh afterwards, rather than storage being left holding a
    // vault for a mnemonic nobody can ever unlock.
    expect(await Wallet.exists(storage)).toBe(false);
    await expect(Wallet.create("password", options({ storage }))).resolves.toBeDefined();
  });
});

describe("lock / unlock", () => {
  it("blocks account access while locked", async () => {
    const { wallet } = await Wallet.create("password", options());
    wallet.lock();
    expect(wallet.isUnlocked).toBe(false);
    expect(() => wallet.accounts.get(stubCoin.id)).toThrow(/locked/);
  });

  it("rejects an unregistered coin id", async () => {
    const { wallet } = await Wallet.create("password", options());
    expect(() => wallet.accounts.get("not-registered")).toThrow(/Unregistered coin/);
  });

  it("wrong password on unlock leaves the wallet locked", async () => {
    const storage = new InMemoryVaultStorage();
    await Wallet.create("password", options({ storage }));
    const reopened = await Wallet.open(options({ storage }));
    await expect(reopened.unlock("wrong password")).rejects.toThrow();
    expect(reopened.isUnlocked).toBe(false);
  });
});

describe("getAccount / listAccounts", () => {
  it("never returns a private key", async () => {
    const { wallet } = await Wallet.create("password", options());
    const account = wallet.accounts.get(stubCoin.id);
    expect("privateKey" in account).toBe(false);
  });

  it("lists distinct accounts by index", async () => {
    const { wallet } = await Wallet.create("password", options());
    const accounts = wallet.accounts.list(stubCoin.id, 3);
    expect(accounts).toHaveLength(3);
    expect(new Set(accounts.map((a) => a.address)).size).toBe(3);
  });
});

describe("withPrivateKey", () => {
  it("derives the same private key deterministically for the same account index", async () => {
    const { wallet } = await Wallet.create("password", options());
    const first = await wallet.accounts.withPrivateKey(stubCoin.id, 0, (privateKey) =>
      privateKey.slice(),
    );
    const second = await wallet.accounts.withPrivateKey(stubCoin.id, 0, (privateKey) =>
      privateKey.slice(),
    );
    expect(first).toEqual(second);
  });

  it("derives different private keys for different account indexes", async () => {
    const { wallet } = await Wallet.create("password", options());
    const first = await wallet.accounts.withPrivateKey(stubCoin.id, 0, (privateKey) =>
      privateKey.slice(),
    );
    const second = await wallet.accounts.withPrivateKey(stubCoin.id, 1, (privateKey) =>
      privateKey.slice(),
    );
    expect(first).not.toEqual(second);
  });

  it("zeroes the private key after an async callback settles", async () => {
    const { wallet } = await Wallet.create("password", options());
    let capturedDuringCall: Uint8Array | undefined;
    let capturedAfterCall: Uint8Array | undefined;

    await wallet.accounts.withPrivateKey(stubCoin.id, 0, async (privateKey) => {
      capturedDuringCall = privateKey.slice();
      await Promise.resolve();
      capturedAfterCall = privateKey;
      expect(capturedAfterCall.some((byte) => byte !== 0)).toBe(true);
    });

    expect(capturedAfterCall).toBeDefined();
    expect(capturedAfterCall?.every((byte) => byte === 0)).toBe(true);
    expect(capturedDuringCall?.some((byte) => byte !== 0)).toBe(true);
  });

  it("still zeroes the key when the callback throws", async () => {
    const { wallet } = await Wallet.create("password", options());
    let captured: Uint8Array | undefined;

    await expect(
      wallet.accounts.withPrivateKey(stubCoin.id, 0, (privateKey) => {
        captured = privateKey;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(captured?.every((byte) => byte === 0)).toBe(true);
  });
});

describe("changePassword", () => {
  it("persists the re-encrypted vault so a fresh open needs the new password", async () => {
    const storage = new InMemoryVaultStorage();
    const { wallet } = await Wallet.create("old password", options({ storage }));
    const addressBefore = wallet.accounts.get(stubCoin.id).address;
    await wallet.changePassword("old password", "new password");

    const reopened = await Wallet.open(options({ storage }));
    await expect(reopened.unlock("old password")).rejects.toThrow();
    await reopened.unlock("new password");
    expect(reopened.accounts.get(stubCoin.id).address).toBe(addressBefore);
  });
});

describe("reset", () => {
  it("locks, clears storage, and requires create/import again", async () => {
    const storage = new InMemoryVaultStorage();
    const { wallet } = await Wallet.create("password", options({ storage }));
    await wallet.reset();

    expect(wallet.isUnlocked).toBe(false);
    expect(await storage.load()).toBeNull();
    await expect(Wallet.open(options({ storage }))).rejects.toThrow(/No vault found/);
  });
});

describe("auto-lock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("locks itself after the configured inactivity period", async () => {
    const { wallet } = await Wallet.create("password", options({ autoLockMs: 1000 }));
    expect(wallet.isUnlocked).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(wallet.isUnlocked).toBe(false);
  });

  it("account access resets the timer", async () => {
    const { wallet } = await Wallet.create("password", options({ autoLockMs: 1000 }));

    vi.advanceTimersByTime(600);
    wallet.accounts.get(stubCoin.id);
    vi.advanceTimersByTime(600);
    expect(wallet.isUnlocked).toBe(true);

    vi.advanceTimersByTime(400);
    expect(wallet.isUnlocked).toBe(false);
  });

  it("vault-mutating operations reset the timer too, not just account reads", async () => {
    const { wallet } = await Wallet.create("password", options({ autoLockMs: 1000 }));

    vi.advanceTimersByTime(600);
    await wallet.imported.import("password", stubCoin.id, TEST_PRIVATE_KEY_HEX);
    vi.advanceTimersByTime(600);
    expect(wallet.isUnlocked).toBe(true);

    vi.advanceTimersByTime(400);
    expect(wallet.isUnlocked).toBe(false);
  });

  it("does not start the timer for a vault-mutating call while already locked", async () => {
    const storage = new InMemoryVaultStorage();
    const { wallet } = await Wallet.create("password", options({ storage, autoLockMs: 1000 }));
    wallet.lock();
    expect(vi.getTimerCount()).toBe(0);

    // If this scheduled a timer despite being locked, it'd be a pointless
    // pending `lock()` call — harmless in effect, but a real leak (e.g. it'd
    // keep a Node process alive) not visible through `isUnlocked` alone.
    await wallet.imported.import("password", stubCoin.id, TEST_PRIVATE_KEY_HEX);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("importPrivateKey / imported accounts", () => {
  it("returns a public account with no private key and no HD path", async () => {
    const { wallet } = await Wallet.create("password", options());
    const account = await wallet.imported.import("password", stubCoin.id, TEST_PRIVATE_KEY_HEX);

    expect(account.path).toBe(IMPORTED_ACCOUNT_PATH);
    expect(account.address).toBe(`stub:${bytesToHex(account.publicKey)}`);
    expect("privateKey" in account).toBe(false);
  });

  it("shows up in listImportedAccounts, optionally filtered by coin", async () => {
    const { wallet } = await Wallet.create("password", options());
    const account = await wallet.imported.import("password", stubCoin.id, TEST_PRIVATE_KEY_HEX);

    expect(wallet.imported.list().map((a) => a.address)).toEqual([account.address]);
    expect(wallet.imported.list(stubCoin.id)).toHaveLength(1);
    expect(wallet.imported.list("other-coin")).toHaveLength(0);
  });

  it("persists across sessions: a fresh Wallet.open + unlock sees the imported account", async () => {
    const storage = new InMemoryVaultStorage();
    const { wallet } = await Wallet.create("password", options({ storage }));
    const account = await wallet.imported.import("password", stubCoin.id, TEST_PRIVATE_KEY_HEX);

    const reopened = await Wallet.open(options({ storage }));
    await reopened.unlock("password");
    expect(reopened.imported.list().map((a) => a.address)).toEqual([account.address]);
  });

  it("requires the correct password", async () => {
    const { wallet } = await Wallet.create("password", options());
    await expect(
      wallet.imported.import("wrong password", stubCoin.id, TEST_PRIVATE_KEY_HEX),
    ).rejects.toThrow(VaultUnlockError);
  });

  it("rejects an unregistered coin id", async () => {
    const { wallet } = await Wallet.create("password", options());
    await expect(
      wallet.imported.import("password", "not-registered", TEST_PRIVATE_KEY_HEX),
    ).rejects.toThrow(/Unregistered coin/);
  });

  it("rejects importing the same key for the same coin twice", async () => {
    const { wallet } = await Wallet.create("password", options());
    await wallet.imported.import("password", stubCoin.id, TEST_PRIVATE_KEY_HEX);
    await expect(
      wallet.imported.import("password", stubCoin.id, TEST_PRIVATE_KEY_HEX),
    ).rejects.toThrow(/already imported/);
  });
});

describe("withImportedPrivateKey", () => {
  it("hands back the exact key that was imported", async () => {
    const { wallet } = await Wallet.create("password", options());
    const account = await wallet.imported.import("password", stubCoin.id, TEST_PRIVATE_KEY_HEX);

    const privateKeyHex = await wallet.imported.withPrivateKey(
      stubCoin.id,
      account.address,
      (privateKey) => bytesToHex(privateKey),
    );
    expect(privateKeyHex).toBe(TEST_PRIVATE_KEY_HEX);
  });

  it("zeroes the key after the callback settles", async () => {
    const { wallet } = await Wallet.create("password", options());
    const account = await wallet.imported.import("password", stubCoin.id, TEST_PRIVATE_KEY_HEX);

    let captured: Uint8Array | undefined;
    await wallet.imported.withPrivateKey(stubCoin.id, account.address, (privateKey) => {
      captured = privateKey;
    });
    expect(captured?.every((byte) => byte === 0)).toBe(true);
  });

  it("throws for an address that was never imported", async () => {
    const { wallet } = await Wallet.create("password", options());
    await expect(
      wallet.imported.withPrivateKey(stubCoin.id, "0xnope", () => undefined),
    ).rejects.toThrow(/No imported account/);
  });

  it("throws while locked, even though storage still has the key", async () => {
    const storage = new InMemoryVaultStorage();
    const { wallet } = await Wallet.create("password", options({ storage }));
    const account = await wallet.imported.import("password", stubCoin.id, TEST_PRIVATE_KEY_HEX);
    wallet.lock();

    await expect(
      wallet.imported.withPrivateKey(stubCoin.id, account.address, () => undefined),
    ).rejects.toThrow(/locked/);
  });
});

describe("removeImportedAccount", () => {
  it("removes the account and persists the removal", async () => {
    const storage = new InMemoryVaultStorage();
    const { wallet } = await Wallet.create("password", options({ storage }));
    const account = await wallet.imported.import("password", stubCoin.id, TEST_PRIVATE_KEY_HEX);

    await wallet.imported.remove("password", stubCoin.id, account.address);
    expect(wallet.imported.list()).toHaveLength(0);

    const reopened = await Wallet.open(options({ storage }));
    await reopened.unlock("password");
    expect(reopened.imported.list()).toHaveLength(0);
  });
});

describe("BIP-39 passphrase ('25th word')", () => {
  it("derives a different account than no passphrase, for the same mnemonic", async () => {
    const { wallet, mnemonic } = await Wallet.create("password", options());
    const standardAddress = wallet.accounts.get(stubCoin.id).address;

    const hidden = await Wallet.import(
      mnemonic,
      "password",
      options(),
      "correct horse battery staple",
    );
    const hiddenAddress = hidden.accounts.get(stubCoin.id).address;

    expect(hiddenAddress).not.toBe(standardAddress);
  });

  it("is deterministic: the same passphrase always unlocks into the same accounts", async () => {
    const storage = new InMemoryVaultStorage();
    const { wallet: created } = await Wallet.create(
      "password",
      options({ storage }),
      "my passphrase",
    );
    const firstAddress = created.accounts.get(stubCoin.id).address;

    const reopened = await Wallet.open(options({ storage }));
    await reopened.unlock("password", "my passphrase");
    expect(reopened.accounts.get(stubCoin.id).address).toBe(firstAddress);
  });

  it("is never persisted: reopening without it falls back to the standard (no-passphrase) accounts", async () => {
    const storage = new InMemoryVaultStorage();
    const { wallet: created } = await Wallet.create(
      "password",
      options({ storage }),
      "my passphrase",
    );
    const hiddenAddress = created.accounts.get(stubCoin.id).address;

    const reopenedPlain = await Wallet.open(options({ storage }));
    await reopenedPlain.unlock("password");
    expect(reopenedPlain.accounts.get(stubCoin.id).address).not.toBe(hiddenAddress);

    // The hidden accounts are still reachable — they just require the
    // passphrase again, exactly like a Ledger/Trezor hidden wallet.
    const reopenedHidden = await Wallet.open(options({ storage }));
    await reopenedHidden.unlock("password", "my passphrase");
    expect(reopenedHidden.accounts.get(stubCoin.id).address).toBe(hiddenAddress);
  });

  it("an empty passphrase is the same as no passphrase", async () => {
    const { wallet, mnemonic } = await Wallet.create("password", options());
    const defaultAddress = wallet.accounts.get(stubCoin.id).address;

    const explicit = await Wallet.import(mnemonic, "password", options(), "");
    expect(explicit.accounts.get(stubCoin.id).address).toBe(defaultAddress);
  });
});

describe("Wallet.exists", () => {
  it("is false before create() and true after", async () => {
    const storage = new InMemoryVaultStorage();
    expect(await Wallet.exists(storage)).toBe(false);

    await Wallet.create("password", options({ storage }));
    expect(await Wallet.exists(storage)).toBe(true);
  });

  it("is false again after reset()", async () => {
    const storage = new InMemoryVaultStorage();
    const { wallet } = await Wallet.create("password", options({ storage }));
    await wallet.reset();
    expect(await Wallet.exists(storage)).toBe(false);
  });
});

describe("additional seeds", () => {
  it("addSeed derives independent accounts from the primary seed", async () => {
    const { wallet } = await Wallet.create("password", options());
    const primaryAddress = wallet.accounts.get(stubCoin.id).address;

    const { seedId, mnemonic } = await wallet.seeds.add("password");
    expect(mnemonic.split(" ")).toHaveLength(12);
    const additionalAddress = wallet.accounts.get(stubCoin.id, 0, { seedId }).address;

    expect(additionalAddress).not.toBe(primaryAddress);
  });

  it("importSeed restores a known mnemonic as an additional seed", async () => {
    const { mnemonic: otherMnemonic } = await Wallet.create("password", options());
    const { wallet: standalone } = await Wallet.create("password", options());
    const expectedAddress = (
      await Wallet.import(otherMnemonic, "password", options())
    ).accounts.get(stubCoin.id).address;

    const seedId = await standalone.seeds.import(otherMnemonic, "password");
    expect(standalone.accounts.get(stubCoin.id, 0, { seedId }).address).toBe(expectedAddress);
  });

  it("listSeeds reports id and name, empty for the primary seed and while locked", async () => {
    const { wallet } = await Wallet.create("password", options());
    expect(wallet.seeds.list()).toEqual([]);

    const { seedId } = await wallet.seeds.add("password", "Trading");
    expect(wallet.seeds.list()).toEqual([{ id: seedId, name: "Trading" }]);

    wallet.lock();
    expect(wallet.seeds.list()).toEqual([]);
  });

  it("persists across sessions: a fresh Wallet.open + unlock sees the additional seed's accounts", async () => {
    const storage = new InMemoryVaultStorage();
    const { wallet } = await Wallet.create("password", options({ storage }));
    const { seedId } = await wallet.seeds.add("password");
    const address = wallet.accounts.get(stubCoin.id, 0, { seedId }).address;

    const reopened = await Wallet.open(options({ storage }));
    await reopened.unlock("password");
    expect(reopened.seeds.list()).toEqual([{ id: seedId }]);
    expect(reopened.accounts.get(stubCoin.id, 0, { seedId }).address).toBe(address);
  });

  it("removeSeed removes it and persists the removal", async () => {
    const storage = new InMemoryVaultStorage();
    const { wallet } = await Wallet.create("password", options({ storage }));
    const { seedId } = await wallet.seeds.add("password");

    await wallet.seeds.remove("password", seedId);
    expect(wallet.seeds.list()).toEqual([]);
    expect(() => wallet.accounts.get(stubCoin.id, 0, { seedId })).toThrow(/Unknown seed id/);

    const reopened = await Wallet.open(options({ storage }));
    await reopened.unlock("password");
    expect(reopened.seeds.list()).toEqual([]);
  });

  it("rejects an unknown seed id", async () => {
    const { wallet } = await Wallet.create("password", options());
    expect(() => wallet.accounts.get(stubCoin.id, 0, { seedId: "not-a-real-seed" })).toThrow(
      /Unknown seed id/,
    );
  });

  it("works while locked, same as importPrivateKey", async () => {
    const storage = new InMemoryVaultStorage();
    const { wallet } = await Wallet.create("password", options({ storage }));
    wallet.lock();

    const { seedId } = await wallet.seeds.add("password");
    expect(wallet.isUnlocked).toBe(false);

    await wallet.unlock("password");
    expect(wallet.seeds.list()).toEqual([{ id: seedId }]);
  });

  it("requires the correct password", async () => {
    const { wallet } = await Wallet.create("password", options());
    await expect(wallet.seeds.add("wrong password")).rejects.toThrow(VaultUnlockError);
  });

  it("importSeed rejects an invalid mnemonic without persisting it", async () => {
    const storage = new InMemoryVaultStorage();
    const { wallet } = await Wallet.create("password", options({ storage }));

    await expect(
      wallet.seeds.import("not a real mnemonic phrase at all", "password"),
    ).rejects.toThrow(/Invalid mnemonic/);
    expect(wallet.seeds.list()).toEqual([]);

    const reopened = await Wallet.open(options({ storage }));
    await reopened.unlock("password");
    expect(reopened.seeds.list()).toEqual([]);
  });

  it("does not affect the primary seed's passphrase-derived accounts", async () => {
    const { mnemonic } = await Wallet.create("password", options());
    const hidden = await Wallet.import(mnemonic, "password", options(), "my passphrase");
    const hiddenAddress = hidden.accounts.get(stubCoin.id).address;

    await hidden.seeds.add("password");
    expect(hidden.accounts.get(stubCoin.id).address).toBe(hiddenAddress);
  });
});

describe("revealMnemonic", () => {
  it("returns the exact mnemonic create() handed out, as bytes", async () => {
    const { wallet, mnemonic } = await Wallet.create("password", options());
    const revealed = await wallet.revealMnemonic("password");
    expect(bytesToUtf8(revealed)).toBe(mnemonic);
  });

  it("requires the correct password", async () => {
    const { wallet } = await Wallet.create("password", options());
    await expect(wallet.revealMnemonic("wrong password")).rejects.toThrow(VaultUnlockError);
  });

  it("works even while locked", async () => {
    const storage = new InMemoryVaultStorage();
    const { wallet, mnemonic } = await Wallet.create("password", options({ storage }));
    wallet.lock();
    const revealed = await wallet.revealMnemonic("password");
    expect(bytesToUtf8(revealed)).toBe(mnemonic);
  });

  it("reveals an additional seed's mnemonic given its id", async () => {
    const { wallet } = await Wallet.create("password", options());
    const { seedId, mnemonic } = await wallet.seeds.add("password");

    const revealed = await wallet.revealMnemonic("password", seedId);
    expect(bytesToUtf8(revealed)).toBe(mnemonic);
  });

  it("rejects an unknown seed id", async () => {
    const { wallet } = await Wallet.create("password", options());
    await expect(wallet.revealMnemonic("password", "not-a-real-seed")).rejects.toThrow(
      /Unknown seed id/,
    );
  });
});
