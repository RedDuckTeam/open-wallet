import { encodeFunctionData, parseAbi, type Address, type Hex, type PublicClient } from "viem";

/**
 * ERC-6551's execution interface. `operation` is 0 for a plain CALL; the
 * standard reserves 1-3 (DELEGATECALL, CREATE, CREATE2) and lets an
 * implementation reject them. This wallet only ever sends 0 — a wallet
 * issuing a DELEGATECALL from an account holding assets is handing that
 * account's storage to arbitrary code.
 */
const ACCOUNT_ABI = parseAbi([
  "function execute(address to, uint256 value, bytes data, uint8 operation) payable returns (bytes)",
  "function token() view returns (uint256 chainId, address tokenContract, uint256 tokenId)",
  "function owner() view returns (address)",
  "function state() view returns (uint256)",
]);

const OPERATION_CALL = 0;

export interface TbaCall {
  readonly to: Address;
  readonly value?: bigint;
  readonly data?: Hex;
}

/**
 * Calldata that makes a token bound account perform one call.
 *
 * Returned as calldata rather than a built transaction so the caller decides
 * how it travels: as an EOA transaction from the NFT's owner, or as one call
 * inside an ERC-4337 batch. The account's authority comes from the *signer*
 * being the NFT's current owner, which is checked on-chain — nothing here
 * grants it.
 */
export function encodeTbaExecute(call: TbaCall): Hex {
  return encodeFunctionData({
    abi: ACCOUNT_ABI,
    functionName: "execute",
    args: [call.to, call.value ?? 0n, call.data ?? "0x", OPERATION_CALL],
  });
}

/**
 * The account's current owner — the holder of the bound NFT, which the
 * account resolves itself.
 *
 * Worth asking the account rather than the NFT contract: ownership can change
 * with the token at any moment, and the account is the authority on who it
 * will accept calls from right now. Returns `null` for an account that isn't
 * deployed yet, which has no `owner()` to call.
 */
export async function getTbaOwner(client: PublicClient, account: Address): Promise<Address | null> {
  try {
    return await client.readContract({ address: account, abi: ACCOUNT_ABI, functionName: "owner" });
  } catch {
    return null;
  }
}

/** The NFT an account is bound to, read back from the account itself. */
export async function getTbaToken(
  client: PublicClient,
  account: Address,
): Promise<{ chainId: number; tokenContract: Address; tokenId: bigint } | null> {
  try {
    const [chainId, tokenContract, tokenId] = await client.readContract({
      address: account,
      abi: ACCOUNT_ABI,
      functionName: "token",
    });
    return { chainId: Number(chainId), tokenContract, tokenId };
  } catch {
    return null;
  }
}
