import { ChainRegistry, HdKeyring, InvalidAddressError } from "@openwallet/core";
import type { NativeSendRequest } from "@openwallet/core";
import { createEvmAdapter, evmCoin } from "@openwallet/chain-evm";
import { createSolanaAdapter, solanaCoin } from "@openwallet/chain-solana";
import { createBitcoinAdapter, bitcoinCoin } from "@openwallet/chain-bitcoin";
import type { Utxo } from "@openwallet/chain-bitcoin";
import { networks, payments } from "bitcoinjs-lib";
import { describe, expect, it, vi } from "vitest";

// One deterministic mnemonic drives all three chains — Hardhat/Anvil's
// canonical dev mnemonic, the same ground truth the per-chain coin tests use.
// Each chain package derives its own account (curve, path, address encoding)
// from it, so the send-flow keys/addresses below are reproducible.
const TEST_MNEMONIC = "test test test test test test test test test test test junk";
const keyring = HdKeyring.fromMnemonic(TEST_MNEMONIC);
const evmAccount = keyring.deriveAccount(evmCoin, 0);
const solanaAccount = keyring.deriveAccount(solanaCoin, 0);
const bitcoinAccount = keyring.deriveAccount(bitcoinCoin, 0);

// The scriptPubKey for the Bitcoin account's own p2wpkh address, so the mock
// UTXO is actually spendable by `bitcoinAccount.privateKey` (the PSBT has to
// sign and finalize end to end, not just be assembled).
const bitcoinOutput = payments.p2wpkh({
  pubkey: bitcoinAccount.publicKey,
  network: networks.bitcoin,
}).output;
if (!bitcoinOutput) {
  throw new Error("failed to build the Bitcoin p2wpkh script for the test fixture");
}

// EVM `PublicClient` mock: covers `buildNativeTransfer` (nonce/fees/gas/chainId),
// `getFeeTiers` (block base fee + priority fee), and `sendRawTransaction`. The
// concrete client type comes from the adapter factory's own signature, so this
// file never imports viem directly.
const evmClient = {
  getTransactionCount: vi.fn().mockResolvedValue(7),
  estimateFeesPerGas: vi.fn().mockResolvedValue({
    maxFeePerGas: 30_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  }),
  estimateGas: vi.fn().mockResolvedValue(21_000n),
  getChainId: vi.fn().mockResolvedValue(1),
  getBlock: vi.fn().mockResolvedValue({ baseFeePerGas: 10_000_000_000n }),
  estimateMaxPriorityFeePerGas: vi.fn().mockResolvedValue(1_000_000_000n),
  sendRawTransaction: vi.fn().mockResolvedValue("0xevmhash"),
  getBalance: vi.fn().mockResolvedValue(1_000n),
} as unknown as Parameters<typeof createEvmAdapter>[0];

// Solana `Connection` mock. The blockhash must decode to 32 bytes, so the
// account's own base58 address doubles as a valid fake blockhash.
const solanaConnection = {
  getLatestBlockhash: vi.fn().mockResolvedValue({
    blockhash: solanaAccount.address,
    lastValidBlockHeight: 100,
  }),
  getRecentPrioritizationFees: vi.fn().mockResolvedValue([{ slot: 1, prioritizationFee: 100 }]),
  sendRawTransaction: vi.fn().mockResolvedValue("solana-signature"),
  getBalance: vi.fn().mockResolvedValue(5_000_000),
} as unknown as Parameters<typeof createSolanaAdapter>[0];

// Bitcoin providers are injected (unlike EVM/Solana's RPC clients): a single
// UTXO big enough to cover the amount plus fee, a fixed fee rate, and a
// broadcaster that echoes a txid.
const bitcoinUtxos: readonly Utxo[] = [
  { txid: "a".repeat(64), vout: 0, value: 100_000, script: bitcoinOutput },
];
const bitcoinAdapter = createBitcoinAdapter({
  utxoProvider: { listUtxos: vi.fn().mockResolvedValue(bitcoinUtxos) },
  feeRateSource: { getFeeRate: vi.fn().mockResolvedValue(1) },
  broadcaster: { broadcast: vi.fn().mockResolvedValue("bitcoin-txid") },
});

const evmAdapter = createEvmAdapter(evmClient);
const solanaAdapter = createSolanaAdapter(solanaConnection);

// Registering the concrete `ChainAdapter<XxxChainTypes>` adapters into a
// registry that stores the all-`unknown` `ChainAdapter` is the upcast the
// method-syntax contract exists to allow (SY-3).
const registry = new ChainRegistry();
registry.register(evmAdapter);
registry.register(solanaAdapter);
registry.register(bitcoinAdapter);

const BAD_ADDRESS = "not-a-valid-address";

interface SendCase {
  readonly id: string;
  readonly req: NativeSendRequest;
  readonly key: Uint8Array;
  /** Chain-appropriate message value, prepared per-chain outside the uniform loop. */
  readonly message: string | Uint8Array;
  readonly expectedBroadcast: string;
  readonly hasTokens: boolean;
}

const SEND_CASES: readonly SendCase[] = [
  {
    id: "evm",
    req: { from: evmAccount.address, to: evmAccount.address, amount: 1_000n },
    key: evmAccount.privateKey,
    message: "hello openwallet",
    expectedBroadcast: "0xevmhash",
    hasTokens: true,
  },
  {
    id: "solana",
    req: { from: solanaAccount.address, to: solanaAccount.address, amount: 1_000_000n },
    key: solanaAccount.privateKey,
    message: new TextEncoder().encode("hello openwallet"),
    expectedBroadcast: "solana-signature",
    hasTokens: true,
  },
  {
    id: "bitcoin",
    req: { from: bitcoinAccount.address, to: bitcoinAccount.address, amount: 50_000n },
    key: bitcoinAccount.privateKey,
    message: "hello openwallet",
    expectedBroadcast: "bitcoin-txid",
    hasTokens: false,
  },
];

describe("chain-agnostic send flow", () => {
  it("registers every chain adapter under its own id", () => {
    expect(registry.ids()).toEqual(["evm", "solana", "bitcoin"]);
  });

  it("drives every registered chain through one uniform build→sign→broadcast pipe", async () => {
    for (const testCase of SEND_CASES) {
      const adapter = registry.adapter(testCase.id);

      adapter.validate(testCase.req);
      const unsigned = await adapter.buildTransfer(testCase.req);
      expect(unsigned).toBeDefined();
      const fees = await adapter.estimateFees(testCase.req);
      expect(fees).toBeDefined();
      const signed = await adapter.sign(unsigned, testCase.key);
      expect(signed).toBeDefined();
      const broadcastResult = await adapter.broadcast(signed);
      expect(broadcastResult).toBe(testCase.expectedBroadcast);

      // `signMessage` is a required member — invoked successfully on all three.
      const signature = await adapter.signMessage(testCase.message, testCase.key);
      expect(signature).toBeDefined();

      // `tokens` is the one honest optional capability: present for evm/solana,
      // absent (typed `undefined`) for bitcoin.
      expect(adapter.tokens === undefined).toBe(!testCase.hasTokens);
    }
  });

  it("rejects an invalid sender or recipient on every chain", () => {
    for (const testCase of SEND_CASES) {
      const adapter = registry.adapter(testCase.id);

      expect(() =>
        adapter.validate({ from: testCase.req.from, to: BAD_ADDRESS, amount: testCase.req.amount }),
      ).toThrow(InvalidAddressError);
      expect(() =>
        adapter.validate({ from: BAD_ADDRESS, to: testCase.req.to, amount: testCase.req.amount }),
      ).toThrow(InvalidAddressError);
    }
  });

  it("exposes token operations on the typed evm/solana adapters, but not bitcoin", () => {
    expect(typeof evmAdapter.tokens?.getBalance).toBe("function");
    expect(typeof evmAdapter.tokens?.buildTransfer).toBe("function");
    expect(typeof solanaAdapter.tokens?.getBalance).toBe("function");
    expect(typeof solanaAdapter.tokens?.buildTransfer).toBe("function");
    expect(bitcoinAdapter.tokens).toBeUndefined();
  });
});
