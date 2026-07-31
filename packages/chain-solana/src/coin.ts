import { PublicKey } from "@solana/web3.js";
import type { CoinEntry } from "@openwallet/core";
import { SOLANA_COIN_TYPE } from "./constants.js";

export const solanaCoin: CoinEntry = {
  id: "solana",
  curve: "ed25519",
  // Phantom's convention (fully hardened, no address-index level). Solflare's
  // `m/44'/501'/0'` and Sollet's un-hardened paths are also seen in the wild;
  // this is the most widely interoperable of the three — see docs/architecture.md.
  derivationPath: (accountIndex) =>
    `m/44'/${String(SOLANA_COIN_TYPE)}'/${String(accountIndex)}'/0'`,
  deriveAddress: (publicKey) => new PublicKey(publicKey).toBase58(),
};
