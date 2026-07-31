import { describe, expect, it } from "vitest";
import {
  CURRENT_SETTINGS_VERSION,
  migrateSettings,
} from "../../apps/extension/src/platform/settings-migrations.js";
import { hdAccountId } from "../../apps/extension/src/background/account-id.js";

describe("migrateSettings", () => {
  it("upgrades a pre-versioning (v0) blob: activeAccountIndex -> activeAccountId", () => {
    const legacy = {
      activeNetworkId: "base",
      activeAccountIndex: 2,
      accountCount: 3,
      customTokens: {},
    };
    const migrated = migrateSettings(legacy);
    expect(migrated.activeAccountId).toBe(hdAccountId(2));
    expect(migrated).not.toHaveProperty("activeAccountIndex");
    // Untouched fields carry through; missing ones are left to DEFAULTS.
    expect(migrated.activeNetworkId).toBe("base");
    expect(migrated.accountCount).toBe(3);
  });

  it("defaults a missing legacy index to the primary account", () => {
    expect(migrateSettings({ activeNetworkId: "solana" }).activeAccountId).toBe(hdAccountId(0));
  });

  it("passes a current-version blob through untouched", () => {
    const settings = { activeNetworkId: "ethereum", activeAccountId: hdAccountId(1) };
    const migrated = migrateSettings({ version: CURRENT_SETTINGS_VERSION, settings });
    expect(migrated).toEqual(settings);
  });
});
