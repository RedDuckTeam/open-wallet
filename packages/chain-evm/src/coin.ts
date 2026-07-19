import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "viem";
import { publicKeyToAddress } from "viem/accounts";
import type { CoinEntry } from "@openwallet/core";
import { EVM_COIN_TYPE } from "./constants.js";

/**
 * `HdKeyring` hands us the SEC1-compressed public key (the BIP-32 default,
 * shared with Bitcoin). Ethereum addresses are keccak256 of the
 * *uncompressed* public key, so we decompress the point before handing it
 * to viem rather than asking the core derivation layer to special-case EVM.
 */
export const evmCoin: CoinEntry = {
  id: "evm",
  curve: "secp256k1",
  derivationPath: (accountIndex) => `m/44'/${String(EVM_COIN_TYPE)}'/0'/0/${String(accountIndex)}`,
  deriveAddress: (publicKey) => {
    const uncompressed = secp256k1.Point.fromBytes(publicKey).toBytes(false);
    return publicKeyToAddress(bytesToHex(uncompressed));
  },
};
