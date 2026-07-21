import { sha256 } from "@noble/hashes/sha2.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { base64 } from "@scure/base";
import { encode as encodeVarint } from "varuint-bitcoin";
import { networks, payments, type Network } from "bitcoinjs-lib";

const textEncoder = new TextEncoder();

// "\x18" is the varint-encoded length (24) of "Bitcoin Signed Message:\n" —
// the classic Bitcoin Core message-signing magic. It's baked in as one
// literal, the same way every other implementation does, rather than
// computed, since the string's length is fixed.
const MESSAGE_MAGIC = new Uint8Array([0x18, ...textEncoder.encode("Bitcoin Signed Message:\n")]);

/**
 * BIP-137 header base for a compressed-pubkey, native SegWit (bech32)
 * address — the only address type this package derives (see `coin.ts`).
 * The actual header byte is this plus the signature's recovery id (0-3).
 * https://github.com/bitcoin/bips/blob/master/bip-0137.mediawiki
 */
const P2WPKH_HEADER_BASE = 39;

function varint(length: number): Uint8Array {
  const { buffer, bytes } = encodeVarint(length);
  return buffer.subarray(0, bytes);
}

/** The classic Bitcoin "signmessage" digest: double-SHA256 of the magic-prefixed, length-prefixed message. */
function messageDigest(message: string): Uint8Array {
  const body = textEncoder.encode(message);
  const formatted = new Uint8Array([...MESSAGE_MAGIC, ...varint(body.length), ...body]);
  return sha256(sha256(formatted));
}

/**
 * Signs `message` the way every Bitcoin wallet does (Bitcoin Core's
 * `signmessage`, Electrum, BIP-137) — base64-encoded, so it can be pasted
 * anywhere a "verify message" field expects one. Verified byte-for-byte
 * against `bitcoinjs-message`'s output during development; see
 * `test/message.test.ts`.
 */
export function signMessage(privateKey: Uint8Array, message: string): string {
  const hash = messageDigest(message);
  const signed = secp256k1.sign(hash, privateKey, {
    prehash: false,
    format: "recovered",
    lowS: true,
  });
  const recoveryByte = signed[0];
  if (recoveryByte === undefined) {
    throw new Error("secp256k1.sign did not return a recoverable signature");
  }
  const header = P2WPKH_HEADER_BASE + recoveryByte;
  return base64.encode(new Uint8Array([header, ...signed.subarray(1)]));
}

/**
 * Verifies that `address` (a p2wpkh address this package would derive)
 * signed `message`. Returns `false` rather than throwing for a malformed
 * signature or one from an address type this package doesn't derive
 * (legacy P2PKH, nested-SegWit) — "not valid for this address" covers both,
 * and a caller checking a signature only cares about the boolean.
 */
export function verifyMessage(
  address: string,
  message: string,
  signatureBase64: string,
  network: Network = networks.bitcoin,
): boolean {
  let signature: Uint8Array;
  try {
    signature = base64.decode(signatureBase64);
  } catch {
    return false;
  }
  if (signature.length !== 65) {
    return false;
  }

  const header = signature[0];
  if (header === undefined || header < P2WPKH_HEADER_BASE || header > P2WPKH_HEADER_BASE + 3) {
    return false;
  }
  const recovery = header - P2WPKH_HEADER_BASE;

  try {
    const hash = messageDigest(message);
    const recoverable = new Uint8Array([recovery, ...signature.subarray(1)]);
    const publicKey = secp256k1.recoverPublicKey(recoverable, hash, { prehash: false });
    const recovered = payments.p2wpkh({ pubkey: publicKey, network });
    return recovered.address === address;
  } catch {
    return false;
  }
}
