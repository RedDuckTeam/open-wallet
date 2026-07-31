import type { KdfParams } from "./types.js";

/**
 * N=2^18, r=8, p=1 — go-ethereum's `StandardScryptN`/`StandardScryptP`, the
 * same cost the Ethereum keystore (V3) format has used for real wallets for
 * years, mirrored by Trust Wallet Core's own "Standard" encryption level.
 * OWASP's Password Storage Cheat Sheet lists N=2^17 as scrypt's *minimum*
 * acceptable cost when Argon2id isn't available — a floor, not a target —
 * so matching the established wallet-ecosystem standard instead means
 * paying roughly 2x the KDF time for meaningfully more brute-force
 * resistance. Measured at ~350ms for this package's own pure-JS scrypt on
 * ordinary desktop hardware (see `packages/core/test/crypto/kdf.test.ts`)
 * — noticeably slower on a phone, but still well inside what a "confirm
 * your password" unlock screen can absorb.
 *
 * We use scrypt instead of Argon2id on purpose: every real Argon2id
 * implementation is WASM or a native binding, and this package has to run
 * identically in a browser-extension service worker, a React Native app,
 * and Node — three runtimes with inconsistent WASM/native support (React
 * Native in particular has no WebAssembly runtime without extra native
 * modules). Scrypt has an audited, dependency-free pure-JS implementation
 * (@noble/hashes) that works everywhere with no per-platform build step.
 * If a platform later wants Argon2id, this is the one function to swap.
 */
export const DEFAULT_KDF_PARAMS: KdfParams = Object.freeze({ N: 2 ** 18, r: 8, p: 1 });

/** 128 bits of entropy -> a 12-word mnemonic. 256 bits (24 words) is the other BIP-39-defined option. */
export const DEFAULT_MNEMONIC_STRENGTH_BITS = 128;
