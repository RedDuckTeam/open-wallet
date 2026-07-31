// A stable two-hue gradient from a string (an address); a small identicon.
export function avatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const from = hash % 360;
  const to = (from + 80 + ((hash >> 8) % 120)) % 360;
  return `linear-gradient(135deg, hsl(${String(from)} 72% 58%), hsl(${String(to)} 72% 46%))`;
}
