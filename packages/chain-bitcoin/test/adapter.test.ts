import { networks } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";
import { createBitcoinAdapter } from "../src/adapter.js";
import type { BitcoinAdapterDeps } from "../src/adapter.js";

const TESTNET_ADDRESS = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
const MAINNET_ADDRESS = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";

function testnetDeps(): BitcoinAdapterDeps {
  return {
    utxoProvider: { listUtxos: () => Promise.resolve([]) },
    feeRateSource: { getFeeRate: () => Promise.resolve(1) },
    broadcaster: { broadcast: () => Promise.resolve("txid") },
    network: networks.testnet,
  };
}

describe("createBitcoinAdapter", () => {
  it("binds isValidAddress to the configured network", () => {
    const adapter = createBitcoinAdapter(testnetDeps());

    expect(adapter.isValidAddress(TESTNET_ADDRESS)).toBe(true);
    expect(adapter.isValidAddress(MAINNET_ADDRESS)).toBe(false);
  });

  it("keeps isValidAddress and validate consistent for the configured network", () => {
    const adapter = createBitcoinAdapter(testnetDeps());

    expect(() =>
      adapter.validate({ from: TESTNET_ADDRESS, to: TESTNET_ADDRESS, amount: 1_000n }),
    ).not.toThrow();
  });
});
