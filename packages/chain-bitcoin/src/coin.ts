import { networks, payments } from "bitcoinjs-lib";
import type { CoinEntry } from "@openwallet/core";
import {
  BITCOIN_BIP84_PURPOSE,
  BITCOIN_COIN_TYPE,
  BITCOIN_TESTNET_COIN_TYPE,
} from "./constants.js";

/**
 * Native SegWit (BIP-84, p2wpkh) only. Legacy (BIP-44) and nested-SegWit
 * (BIP-49) are different `CoinEntry`s if a platform ever needs them — p2wpkh
 * is the sane single default for a new wallet: lower fees than legacy,
 * universally supported today, unlike Taproot which still has patchy wallet
 * support.
 */
export const bitcoinCoin: CoinEntry = {
  id: "bitcoin",
  curve: "secp256k1",
  derivationPath: (accountIndex) =>
    `m/${String(BITCOIN_BIP84_PURPOSE)}'/${String(BITCOIN_COIN_TYPE)}'/0'/0/${String(accountIndex)}`,
  deriveAddress: (publicKey) => {
    const { address } = payments.p2wpkh({ pubkey: publicKey, network: networks.bitcoin });
    if (!address) {
      throw new Error("Failed to derive a p2wpkh address from the given public key");
    }
    return address;
  },
};

/** Same as `bitcoinCoin` but on testnet (coin type 1', tb1 addresses). */
export const bitcoinTestnetCoin: CoinEntry = {
  id: "bitcoin-testnet",
  curve: "secp256k1",
  derivationPath: (accountIndex) =>
    `m/${String(BITCOIN_BIP84_PURPOSE)}'/${String(BITCOIN_TESTNET_COIN_TYPE)}'/0'/0/${String(accountIndex)}`,
  deriveAddress: (publicKey) => {
    const { address } = payments.p2wpkh({ pubkey: publicKey, network: networks.testnet });
    if (!address) {
      throw new Error("Failed to derive a testnet p2wpkh address from the given public key");
    }
    return address;
  },
};
