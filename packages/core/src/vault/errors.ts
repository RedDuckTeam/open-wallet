export class VaultUnlockError extends Error {
  constructor() {
    super("Wrong password, or the vault data is corrupted");
    this.name = "VaultUnlockError";
  }
}
