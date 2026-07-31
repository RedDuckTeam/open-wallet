import { bytesToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex, SignableMessage, TransactionSerializable, TypedDataDefinition } from "viem";

function accountFor(privateKey: Uint8Array): ReturnType<typeof privateKeyToAccount> {
  return privateKeyToAccount(bytesToHex(privateKey));
}

export async function signTransaction(
  privateKey: Uint8Array,
  transaction: TransactionSerializable,
): Promise<Hex> {
  return accountFor(privateKey).signTransaction(transaction);
}

export async function signMessage(privateKey: Uint8Array, message: SignableMessage): Promise<Hex> {
  return accountFor(privateKey).signMessage({ message });
}

export async function signTypedData(
  privateKey: Uint8Array,
  typedData: TypedDataDefinition,
): Promise<Hex> {
  return accountFor(privateKey).signTypedData(typedData);
}
