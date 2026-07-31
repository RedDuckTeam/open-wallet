import { parseAbi } from "viem";

/** The subset of ERC-20 (EIP-20) this package actually calls: balance/metadata reads and a transfer. */
export const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);
