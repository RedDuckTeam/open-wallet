import { AccountType } from "../messaging/protocol.js";

// A serializable account id: HD accounts by index, imported ones by (coin, address).
export type AccountRef =
  | { readonly type: typeof AccountType.Hd; readonly index: number }
  | {
      readonly type: typeof AccountType.Imported;
      readonly coinId: string;
      readonly address: string;
    };

const FIELD_SEPARATOR = ":";
const HD_PREFIX = `${AccountType.Hd}${FIELD_SEPARATOR}`;

export function hdAccountId(index: number): string {
  return `${HD_PREFIX}${String(index)}`;
}

export function importedAccountId(coinId: string, address: string): string {
  return [AccountType.Imported, coinId, address].join(FIELD_SEPARATOR);
}

export function parseAccountId(id: string): AccountRef {
  if (id.startsWith(HD_PREFIX)) {
    return { type: AccountType.Hd, index: Number(id.slice(HD_PREFIX.length)) };
  }
  // Rejoin the address in case it contains the separator.
  const [, coinId = "", ...address] = id.split(FIELD_SEPARATOR);
  return { type: AccountType.Imported, coinId, address: address.join(FIELD_SEPARATOR) };
}
