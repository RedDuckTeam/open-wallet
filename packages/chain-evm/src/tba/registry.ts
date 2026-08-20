import { encodeFunctionData, parseAbi, type Address, type Hex, type PublicClient } from "viem";

/**
 * The ERC-6551 registry, at the same address on every EVM chain.
 *
 * Not a configuration value: the standard mandates deployment at this address
 * via Nick's Factory with a fixed salt, precisely so a token bound account
 * resolves to the same address everywhere. Making it configurable would
 * invite a caller to point it at a different registry and compute addresses
 * nobody else agrees with.
 * https://eips.ethereum.org/EIPS/eip-6551
 */
export const ERC6551_REGISTRY: Address = "0x000000006551c19487814612e58FE06813775758";

/**
 * The reference account implementation (tokenbound v0.3.1). It's a *default*,
 * not a constant of the standard — the implementation address is part of what
 * determines the account's address, so a different implementation is a
 * different account, and callers that need one pass it explicitly.
 */
export const DEFAULT_TBA_IMPLEMENTATION: Address = "0x41C8f39463A868d3A88af00cd0fe7102F30E44eC";

/** Standard salt. Distinct salts yield distinct accounts for the same NFT, which is how one token can own several. */
export const DEFAULT_TBA_SALT: Hex = `0x${"00".repeat(32)}`;

const REGISTRY_ABI = parseAbi([
  "function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId) view returns (address)",
  "function createAccount(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId) returns (address)",
]);

export interface TbaRef {
  readonly chainId: number;
  readonly tokenContract: Address;
  readonly tokenId: bigint;
  readonly implementation?: Address;
  readonly salt?: Hex;
}

/**
 * The address of the account bound to an NFT.
 *
 * Read from the registry rather than computed locally. The address *is*
 * derivable — it's a CREATE2 of an ERC-1167 proxy with the token's identity
 * appended to the bytecode — but re-deriving it here would mean maintaining a
 * second implementation of a hashing rule whose only symptom of being subtly
 * wrong is funds sent to an address nobody controls. One `eth_call` against
 * the canonical registry is cheap and cannot disagree with reality.
 *
 * The address exists whether or not the account is deployed; that's the point
 * of a counterfactual address, and `isTbaDeployed` answers the other half.
 */
export async function getTbaAddress(client: PublicClient, ref: TbaRef): Promise<Address> {
  return client.readContract({
    address: ERC6551_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "account",
    args: [
      ref.implementation ?? DEFAULT_TBA_IMPLEMENTATION,
      ref.salt ?? DEFAULT_TBA_SALT,
      BigInt(ref.chainId),
      ref.tokenContract,
      ref.tokenId,
    ],
  });
}

/** Whether the account has been deployed yet. Until it is, it can receive assets but not act. */
export async function isTbaDeployed(client: PublicClient, account: Address): Promise<boolean> {
  const code = await client.getCode({ address: account });
  return code !== undefined && code !== "0x";
}

/**
 * Calldata that deploys the account. Permissionless by design — anyone may
 * deploy an account for any token, since the deployment grants no control:
 * authority stays with whoever owns the NFT at the time of each call.
 */
export function encodeCreateTbaAccount(ref: TbaRef): Hex {
  return encodeFunctionData({
    abi: REGISTRY_ABI,
    functionName: "createAccount",
    args: [
      ref.implementation ?? DEFAULT_TBA_IMPLEMENTATION,
      ref.salt ?? DEFAULT_TBA_SALT,
      BigInt(ref.chainId),
      ref.tokenContract,
      ref.tokenId,
    ],
  });
}
