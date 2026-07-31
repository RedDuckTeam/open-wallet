// Middle-truncates an address: 0x1234…abcd.
export function truncateAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}
