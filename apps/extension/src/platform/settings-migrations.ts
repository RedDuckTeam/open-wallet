import { hdAccountId } from "../background/account-id.js";

// Kept out of settings-storage.ts (no wxt/browser) so it's testable in Node.
// MIGRATIONS[v] upgrades a blob from version v to v+1; missing fields are
// backfilled from DEFAULTS, so migrations only handle renames/restructures.
const MIGRATIONS: readonly ((data: Record<string, unknown>) => Record<string, unknown>)[] = [
  // v0 -> v1: active account was keyed by HD index, now an account id.
  ({ activeAccountIndex, ...rest }) => ({
    ...rest,
    activeAccountId: hdAccountId(typeof activeAccountIndex === "number" ? activeAccountIndex : 0),
  }),
];

export const CURRENT_SETTINGS_VERSION = MIGRATIONS.length;

interface Persisted {
  readonly version: number;
  readonly settings: Record<string, unknown>;
}

// A pre-versioning (unwrapped) blob is treated as version 0.
function unwrap(raw: unknown): { version: number; data: Record<string, unknown> } {
  if (typeof raw === "object" && raw !== null && "version" in raw && "settings" in raw) {
    const { version, settings } = raw as Persisted;
    return { version, data: { ...settings } };
  }
  return { version: 0, data: { ...(raw as Record<string, unknown>) } };
}

export function migrateSettings(raw: unknown): Record<string, unknown> {
  const { version, data } = unwrap(raw);
  let migrated = data;
  for (let v = version; v < CURRENT_SETTINGS_VERSION; v++) {
    migrated = MIGRATIONS[v](migrated);
  }
  return migrated;
}
