export type Curve = "secp256k1" | "ed25519";

export interface KdfParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

export interface DerivedKey {
  readonly publicKey: Uint8Array;
  readonly privateKey: Uint8Array;
}
