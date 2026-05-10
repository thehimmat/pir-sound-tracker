/**
 * Very lightweight perceptual hash: downsample to 8x8, compare average.
 * Good enough to detect identical frames from a cached feed.
 */
export function simpleHash(buffer: Buffer): string {
  // XOR all bytes in 64-byte chunks as a cheap fingerprint
  const step = Math.max(1, Math.floor(buffer.length / 64));
  const bytes: number[] = [];
  for (let i = 0; i < 64; i++) {
    bytes.push(buffer[i * step] ?? 0);
  }
  return Buffer.from(bytes).toString('hex');
}
