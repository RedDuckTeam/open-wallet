/**
 * Best-effort zeroing of secret buffers (seeds, private keys, derived KDF
 * keys). This can't guarantee the JS engine has no other live copy — GC and
 * JIT can leave traces — but it closes the obvious window where a buffer we
 * control keeps a plaintext secret alive far longer than needed.
 */
export function zero(...buffers: (Uint8Array | null | undefined)[]): void {
  for (const buffer of buffers) {
    buffer?.fill(0);
  }
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function utf8ToBytes(text: string): Uint8Array {
  return textEncoder.encode(text);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}
