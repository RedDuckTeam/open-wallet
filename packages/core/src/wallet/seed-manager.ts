import { bytesToHex, randomBytes } from "@noble/hashes/utils.js";
import { HdKeyring } from "../keyring/hd-keyring.js";
import { generateMnemonic, validateMnemonic } from "../crypto/mnemonic.js";
import type { SeedRecord } from "../vault/types.js";
import type { SeedInfo, WalletSeeds } from "./types.js";
import type { WalletInternals } from "./internals.js";

function generateSeedId(): string {
  return bytesToHex(randomBytes(16));
}

/**
 * Additional seeds: independent HD keyrings alongside the primary one, the
 * same "multiple SRPs" model MetaMask uses. Reached through `wallet.seeds`.
 * Every method requires the wallet's password and works whether or not the
 * wallet is currently unlocked (matching `wallet.imported`).
 */
export class SeedManager implements WalletSeeds {
  constructor(private readonly internals: WalletInternals) {}

  /**
   * Generates a fresh additional seed, persists it in the vault, and returns
   * its id and mnemonic — shown to the user for backup exactly once, same as
   * `Wallet.create()`.
   */
  async add(password: string, name?: string): Promise<{ seedId: string; mnemonic: string }> {
    return this.persistSeed(password, generateMnemonic(), name);
  }

  /** Restores an additional seed from an existing mnemonic. Returns its generated id. */
  async import(mnemonic: string, password: string, name?: string): Promise<string> {
    const { seedId } = await this.persistSeed(password, mnemonic, name);
    return seedId;
  }

  private async persistSeed(
    password: string,
    mnemonic: string,
    name?: string,
  ): Promise<{ seedId: string; mnemonic: string }> {
    // Same reasoning as `Wallet.import`: reject before persisting, not after —
    // an invalid mnemonic stored in `seeds` would otherwise break `unlock()`
    // for the *entire* wallet the next time it runs, not just this one seed.
    if (!validateMnemonic(mnemonic)) {
      throw new Error("Invalid mnemonic");
    }
    const id = generateSeedId();
    const record: SeedRecord = { id, mnemonic, ...(name !== undefined && { name }) };
    await this.internals.commit((vault) => vault.addSeed(password, record));

    if (this.internals.isUnlocked) {
      this.internals.setAdditionalSeed(id, {
        keyring: HdKeyring.fromMnemonic(mnemonic),
        ...(name !== undefined && { name }),
      });
    }
    this.internals.noteActivityIfUnlocked();
    return { seedId: id, mnemonic };
  }

  /** Removes a previously added seed. Requires the wallet's password. The primary seed can't be removed. */
  async remove(password: string, seedId: string): Promise<void> {
    await this.internals.commit((vault) => vault.removeSeed(password, seedId));
    this.internals.deleteAdditionalSeed(seedId);
    this.internals.noteActivityIfUnlocked();
  }

  /** Additional seeds' public info (id, name) — empty while locked. The primary seed isn't included since it has no id of its own. */
  list(): SeedInfo[] {
    return this.internals.listAdditionalSeeds().map(([id, { name }]) => ({
      id,
      ...(name !== undefined && { name }),
    }));
  }
}
