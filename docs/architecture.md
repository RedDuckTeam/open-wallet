# Architecture

This document describes how the workspace is organized, the security
invariants the code depends on, the `ChainAdapter` model that lets chains be
driven uniformly, and the steps to add a new chain. It assumes familiarity
with the [README](../README.md)'s Principles section.

## Package map

The core of the workspace is four packages with one dependency direction —
`chain-* → core`, never the reverse. (Alongside them sit the API contract, two
aggregator clients, and the two apps; see the README's workspace table.)

| Package                     | Holds                                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@openwallet/core`          | Mnemonic/KDF/SLIP-10 crypto, `HdKeyring`/`ImportedKeyring`, the encrypted `Vault`, the `Wallet` facade, and the chain-agnostic `ChainAdapter`/`ChainRegistry` contract |
| `@openwallet/chain-evm`     | EVM address derivation, signing, native + ERC-20 transfers, fee tiers, ENS, speed-up/cancel, ERC-4337 account abstraction (`aa/`)                                      |
| `@openwallet/chain-solana`  | Solana address derivation, signing, native + SPL transfers, fee tiers                                                                                                  |
| `@openwallet/chain-bitcoin` | Bitcoin (native SegWit) address derivation, PSBT signing, native transfers, RBF, message signing                                                                       |

**Dependency direction is `chain-* → core` only** — `core` never imports a
chain package, and chain packages never import each other. This isn't just
convention; it's enforced by ESLint's typed `no-restricted-imports` in
`eslint.config.mjs`:

- `packages/core/**/*.ts` (`eslint.config.mjs:78-96`) is forbidden from
  importing any `@openwallet/chain-*` package.
- `packages/chain-*/**/*.ts` (`eslint.config.mjs:51-77`) is forbidden from
  importing another `@openwallet/chain-*` package, and from deep-importing
  past any workspace package's public entry point (`@openwallet/*/src/*` or
  `@openwallet/*/dist/*` — only the package root, e.g. `@openwallet/core`, is
  a legal import).

A chain package reaches `core` only through its public surface, e.g.
`import type { CoinEntry } from "@openwallet/core"` (see `coin.ts` in any
chain package).

The one deliberate exception to "chain packages never see each other" is
`test/integration/`, which sits outside `packages/` specifically so it can
import all three chains at once to exercise the uniform send flow (see
"Adding a new chain" below and `test/integration/chain-agnostic-send.test.ts`).
It has its own `test/integration/tsconfig.json` wired into both
`eslint.config.mjs`'s `parserOptions.project` and the root `typecheck`
script.

## Module shape of a chain package

Every chain package (`chain-evm`, `chain-solana`, `chain-bitcoin`) follows the
same internal shape, one file per responsibility:

- `coin.ts` — the `CoinEntry` (id, curve, derivation path, address encoding)
- `sign.ts` — transaction and message signing over a raw private key
- `transfer.ts` — building and broadcasting a native-currency send
- **fees** — `fee-tiers.ts` on EVM/Solana, `fee.ts` on Bitcoin (see "Fees are
  chain-specific" below — these files are intentionally **not** renamed to a
  common name; the name reflects what each chain actually returns)
- `validate.ts` — a pure, syntactic `isValidAddress`
- `types.ts` — chain-specific request/response shapes
- `constants.ts` — SLIP-44 coin type and other chain magic numbers
- `errors.ts` — chain-specific errors, or a re-export of a shared `core` error
  (e.g. `chain-evm/src/errors.ts` just re-exports `FeeTooLowError`)
- `adapter.ts` — the `ChainAdapter<XxxChainTypes>` factory (see below)

Chains with an RPC client add `client.ts` (EVM, Solana); chains with a token
layer add a token-transfer module (`erc20.ts`, `spl-token.ts`); Bitcoin adds
`providers.ts` (dependency-injected data sources — no RPC client of its own),
`message.ts`, `wif.ts`, and `rbf.ts`. `index.ts` is the package's only public
export surface.

## The `ChainAdapter` contract

`packages/core/src/chain/adapter.ts` defines the chain-agnostic contract
every chain package implements:

- `ChainTypes` bundles the seven chain-specific types (`UnsignedTx`,
  `SignedTx`, `Fees`, `BroadcastResult`, `Message`, `MessageSignature`,
  `TokenTransferParams`) into one named type parameter, defaulting every
  field to `unknown` (never `any`).
- `ChainAdapter<T extends ChainTypes = ChainTypes>` exposes `isValidAddress`,
  `validate`, `buildTransfer`, `estimateFees`, `sign`, `broadcast`,
  `getNativeBalance`, `signMessage`, and an optional `tokens`.
- `NativeSendRequest` (`{ from, to, amount: bigint }`, all plain `string`s
  plus one base-unit `bigint`) is the one input shape every adapter accepts,
  so `build → sign → broadcast` is a single, type-safe pipe regardless of
  chain — each step consumes the previous step's output of the _same_
  adapter.
- `signMessage` is **required**, not optional — all three chains implement
  message signing (`chain-evm/src/sign.ts`, `chain-solana/src/sign.ts`,
  `chain-bitcoin/src/message.ts`). `tokens` is the only optional capability:
  Bitcoin's adapter omits it entirely (`adapter.tokens === undefined`),
  which is an honest typed absence rather than a stub.
- `validate` throws `InvalidAddressError` if **either** `from` or `to` fails
  `isValidAddress`, so a bad `from` surfaces at this explicit step instead of
  later as a raw viem/`PublicKey` error out of address marshalling inside
  `buildTransfer`.

Every send-flow operation is declared with **method syntax**
(`sign(unsigned, key): ...`), never as a function-typed property. See
"Method syntax is required" in [CONTRIBUTING.md](../CONTRIBUTING.md) for why
this specific detail is load-bearing rather than a style preference.

Each chain package implements the contract as a `createXxxAdapter(...)`
factory in its own `adapter.ts`:

- `chain-evm/src/adapter.ts` — `createEvmAdapter(client: PublicClient): ChainAdapter<EvmChainTypes>`
- `chain-solana/src/adapter.ts` — `createSolanaAdapter(connection: Connection): ChainAdapter<SolanaChainTypes>`
- `chain-bitcoin/src/adapter.ts` — `createBitcoinAdapter(deps: BitcoinAdapterDeps): ChainAdapter<BitcoinChainTypes>`

None of these duplicate logic — each wraps that package's existing standalone
functions (`buildNativeTransfer`, `getFeeTiers`, `signTransaction`,
`broadcastTransaction`, ...), which remain the typed,
chain-specific surface for callers that want it directly instead of through
the adapter.

### Bitcoin's providers: dependency injection instead of a client

EVM and Solana adapters take an RPC client (`PublicClient`, `Connection`).
Bitcoin has no equivalent single client — UTXO indexing, fee-rate estimation,
and broadcasting are platform choices (mempool.space, Electrum, a self-hosted
node) this package deliberately doesn't hardcode. `chain-bitcoin/src/providers.ts`
defines three small DI interfaces instead:

- `UtxoProvider.listUtxos(address)`
- `FeeRateSource.getFeeRate()` (sats/vbyte)
- `Broadcaster.broadcast(rawTxHex)` (returns a txid)

`createBitcoinAdapter` takes an implementation of each as part of its
`BitcoinAdapterDeps`. `estimateFees` returns the injected fee _rate_
(`Fees = number`), not an absolute fee — symmetric with how EVM/Solana's
`estimateFees` also returns rate-like tiers rather than one final number. The
absolute fee is computed inside `buildTransferPsbt` from the actually-selected
UTXOs and is already wired into the returned PSBT; the adapter boundary
deliberately does not re-run coin selection just to pre-estimate it.

## `ChainRegistry` and the two access paths

`packages/core/src/chain/registry.ts` is an in-memory `Map<string, ChainAdapter>`
keyed by `ChainAdapter.id`, with `register`, `get`, `adapter` (throws if
missing), `has`, and `ids`. `register` throws on a duplicate id rather than
silently overwriting (see invariant 8 below).

There are exactly two, deliberately different ways to reach a chain's
adapter:

**1. Chain-agnostic, through the registry** — for code that drives whatever
chains happen to be registered without a per-chain `switch`/import. Types are
erased to the all-`unknown` `ChainAdapter` default, but the send-flow pipe
stays type-safe because each step still consumes the previous step's output
of that same adapter:

```ts
import { ChainRegistry } from "@openwallet/core";
import { createEvmAdapter } from "@openwallet/chain-evm";
import { createSolanaAdapter } from "@openwallet/chain-solana";

const registry = new ChainRegistry();
registry.register(createEvmAdapter(evmClient));
registry.register(createSolanaAdapter(solanaConnection));

for (const id of registry.ids()) {
  const adapter = registry.adapter(id);
  adapter.validate(request);
  const unsigned = await adapter.buildTransfer(request);
  const signed = await adapter.sign(unsigned, privateKey);
  await adapter.broadcast(signed);
}
```

**2. Typed, through the factory directly** — for code that needs a chain's
concrete types or its token operations. The registry isn't involved; the
caller just holds onto what the factory returns:

```ts
import { createEvmAdapter } from "@openwallet/chain-evm";

const evmAdapter = createEvmAdapter(evmClient); // ChainAdapter<EvmChainTypes>
const unsigned = await evmAdapter.buildTransfer(request); // TransactionSerializableEIP1559
const fees = await evmAdapter.estimateFees(request); // FeeTiers, not `unknown`

// Token operations are only meaningful on the typed reference.
const balance = await evmAdapter.tokens?.getBalance(usdcAddress, ownerAddress);
```

This is not a gap — it's two scenarios by design: iterate uniformly, or hold
a fully-typed reference. `ChainRegistry` does **not** currently offer a typed
escape-hatch getter (something like `adapter<T extends ChainTypes>(id):
ChainAdapter<T>`) as a third option; only the plain, non-generic `get`/`adapter`
exist. If one is added later, its cast is inherently unchecked — the registry
has no way to verify that a given `id` actually matches the `T` a caller
asks for — so path 2 should stay the default for typed access.

## Fees are intentionally chain-specific

`ChainTypes.Fees` is deliberately **not** one shape shared across chains:

- EVM and Solana: `Fees = FeeTiers`, a tiered `{ slow, average, fast }`
  object (`chain-evm/src/fee-tiers.ts`, `chain-solana/src/fee-tiers.ts`) —
  both chains have a priority-auction-style gas market where a caller
  reasonably picks a speed.
- Bitcoin: `Fees = number`, a scalar fee rate in sats/vbyte, sourced from the
  injected `FeeRateSource` (see `chain-bitcoin/src/fee.ts`'s `estimateVsize`,
  used internally by `buildTransferPsbt` to turn that rate into an absolute
  fee for the selected inputs). Bitcoin's mempool fee market isn't tiered in
  the same sense, so forcing a `{ slow, average, fast }` shape onto it would
  invent tiers the chain doesn't have.

This is a consequence of genuinely incompatible fee models, not an
inconsistency to clean up. A new chain's adapter should define whatever
`Fees` shape matches its own fee market — copy `FeeTiers` only if the new
chain's fee market is actually tiered the same way; otherwise define
something else, the same way Bitcoin does.

## Account abstraction (ERC-4337) lives beside the adapter, not inside it

`packages/chain-evm/src/aa/` implements ERC-4337. It is deliberately **not**
part of `ChainAdapter`, for the same reason ENS and speed-up/cancel aren't:
EntryPoints, User Operations and bundlers are an EVM-family concept, and
forcing them into the one contract Solana and Bitcoin also implement would
invent an abstraction neither chain has. It's exported directly from
`@openwallet/chain-evm` instead, and the extension reaches it through its own
platform seam, `apps/extension/src/background/smart-account.ts`, the
counterpart of `chains.ts`.

### The signer port exists to preserve invariant 1

viem's smart-account factories take a long-lived `PrivateKeyAccount` and call
it repeatedly across network round-trips. Handing one a raw key would retire
invariant 1 (below) for every ERC-4337 path — the key would stay alive for a
whole session rather than one callback.

So `aa/signer.ts` inverts it. `EvmSigner` is an address, a public key, and
`withPrivateKey` — the same borrow-shaped capability
`Wallet.accounts.withPrivateKey` already provides. `toOwnerAccount(signer)`
builds the object viem wants on top of it, routing every `sign*` method back
through the callback, so the key materializes only for the microtask of one
signature. The extension's `ActiveSigner` is the same idea in platform
vocabulary and adapts to it in `smart-account.ts`.

### Two phases, because viem's one phase re-prices after approval

`sendUserOperation` re-runs `prepareUserOperation` whenever it's given an
account — which would silently re-price an operation the user already
approved. `aa/user-operation.ts` therefore splits the flow along the same
seam the rest of the package uses:

```
prepareCalls  →  account.signUserOperation  →  sendCalls (no account)
   build                    sign                     broadcast
```

`sendCalls` passes no account and a fully-formed, signed operation, so the
bundler receives exactly the bytes that were approved. `PreparedCalls` is the
ERC-4337 counterpart of `TransactionSerializableEIP1559`.

### Smart-account kinds are pluggable; EIP-7702 is the default

`aa/account.ts` defines `SmartAccountProvider`, with three implementations —
`simple7702Provider` (default), `coinbaseProvider`, `soladyProvider`. The
property callers branch on is `sharesOwnerAddress`, not the vendor:

- **EIP-7702** (`Simple7702`, EntryPoint 0.8): the user's own EOA gains
  smart-account behaviour. Same address, same balance, nothing to migrate.
  This is the model MetaMask ships as an opt-in "switch to smart account".
- **Counterfactual** (Coinbase, Solady): a distinct address derived from the
  owner, with its own separate balance.

The abstraction isn't speculative: EIP-6551 token-bound accounts are also
"a smart account whose address is not the signer's address", and plug in here.

`aa/delegation.ts` reads EIP-7702's delegation indicator (`0xef0100 ||
address`, 23 bytes, unambiguous because EIP-3541 reserves the `0xef` lead
byte). `SmartAccountInfo` reports `delegatedTo` _and_ `implementation` so a
caller can distinguish "not upgraded" from "upgraded by a different wallet" —
a real state the wallet refuses to overwrite.

### Bundlers and paymasters are injected, and user-configurable

`aa/bundler.ts` takes a `BundlerConfig` (`url`, optional ERC-7677
`paymasterUrl`) rather than hardcoding a provider, following
`chain-bitcoin/src/providers.ts`. In the extension the endpoint resolves as
**user override → build-time env (`WXT_BUNDLER_URL`, `{chainId}` placeholder)
→ none**; these URLs usually carry a provider API key, so they're editable in
Settings → Smart account, and stored in plain settings rather than the vault
(a rate-limit credential isn't a fund-moving secret, and vaulting it would
only stop the wallet reading its own endpoint while locked).

**No bundler means no smart accounts.** Unlike an RPC there's no public
fallback, so `SmartAccountService.isSupported` reports it as a capability
rather than failing at send time.

### dApps reach it through EIP-5792, not a bespoke method

`wallet_sendCalls`, `wallet_getCallsStatus`, `wallet_getCapabilities` and
`wallet_showCallsStatus` are routed in `dapp/rpc-router.ts` and implemented in
`dapp/provider-service.ts`. The `atomic` capability is answered from the
account's real on-chain state: `supported` when it already batches, `ready`
when this wallet can upgrade it on demand, `unsupported` otherwise.

Batch ids are **self-describing** — the User Operation hash followed by the
chain id, as one opaque hex string (`encodeBatchId`/`decodeBatchId` in
`dapp/dapp-params.ts`). The obvious `Map<id, operation>` is wrong in an MV3
extension: the background worker is evicted when idle, which would make every
in-flight batch a dApp is polling permanently unknown.

## NFTs and EIP-6551

`packages/chain-evm/src/nft/` and `packages/chain-evm/src/tba/` sit beside the
AA layer, off `ChainAdapter` for the same reason: `TokenOperations` is a
_fungible-balance_ contract, and an NFT is identified by a token id rather
than an amount.

- `nft/standard.ts` asks ERC-165 which standard a contract implements instead
  of probing which call reverts — a revert is ambiguous, and treating an
  ERC-1155 as an ERC-721 builds a transfer with the wrong signature.
- `nft/metadata.ts` resolves `ipfs://` (both the bare and legacy `ipfs://ipfs/`
  forms) and `ar://` to a gateway, and substitutes ERC-1155's `{id}` as 64
  zero-padded lowercase hex digits, per that standard. Metadata JSON is
  third-party content, so every field is parsed defensively: one collection
  shipping a number where a string was expected must not break the list.
- `nft/transfer.ts` always uses `safeTransferFrom`, so a contract receiver that
  can't acknowledge the token rejects the transfer instead of trapping it.
- `tba/registry.ts` reads a token bound account's address from the canonical
  ERC-6551 registry (`0x000000006551c19487814612e58FE06813775758`, the same
  address on every chain) rather than re-deriving the CREATE2 locally: a
  subtly wrong re-derivation's only symptom is funds sent to an address nobody
  controls.
- `tba/execute.ts` only ever emits operation `0` (CALL). DELEGATECALL from an
  account that holds assets hands its storage to arbitrary code.

**Listing is two-sourced.** Standard JSON-RPC has no "what does this address
own" method — ERC-721 stores `tokenId → owner`, and the reverse mapping exists
only in an index built from `Transfer` events. So enumeration needs an
indexer, while reading one _known_ `(contract, tokenId)` is plain `eth_call`
and always works. `apps/extension/src/background/nfts.ts` combines both, the
same pairing MetaMask ships as "autodetect + import NFT".

The indexer is a **port**, `apps/api/src/nfts/indexer.ts`, with two
implementations selected by `NFT_INDEXER`:

| Provider     | Key | Spam filtering | Notes                                            |
| ------------ | --- | -------------- | ------------------------------------------------ |
| `alchemy`    | yes | yes            | The class of source MetaMask uses                |
| `blockscout` | no  | no             | Public instances; the default when no key is set |
| `none`       | —   | —              | Listing off; manual NFTs still work              |

Note that this does **not** make the API an RPC client — it has never made a
JSON-RPC call, and an NFT indexer is a plain HTTP API in the same category as
CoinGecko. A deployment using Alchemy for the extension's RPC still configures
the NFT key separately: different products, opposite sides of the wire.

Detection is **opt-in** (`autodetectNfts`, default off), because asking an
indexer what an address holds necessarily discloses that address to it. Image
loading is a second, separate toggle (`displayNftMedia`), because rendering a
token's media discloses the viewer's IP to whatever host the collection chose.
These are the same two switches, with the same rationale, that MetaMask
ships. The wire carries `indexed: false` when no indexer
answered, because an unconfigured wallet and an empty one are otherwise
indistinguishable.

Token ids cross every boundary as decimal **strings** and are `bigint` in
memory, never `number`: uint256 ids routinely exceed `Number.MAX_SAFE_INTEGER`,
and a rounded id addresses a different token.

## Where the smart account is actually used

Having the ERC-4337 plumbing is not the same as using it, so the wallet routes
its own operations through it whenever the account can:

- `Message.send` executes as a single-call User Operation when
  `SmartAccountService.canBatch` is true, and as a plain transaction otherwise.
- `swap.ts` batches approve + swap into **one atomic User Operation** on a
  smart account. As two transactions the approval can land while the swap
  fails, leaving a standing allowance and nothing to show for it; batched,
  either both happen or neither does. This is the everyday reason account
  abstraction earns its place in a wallet.

`canBatch` is true only for an EIP-7702 account already delegated to our
implementation. It is deliberately false for counterfactual kinds even when
deployed: there the smart account is a _different address with its own
balance_, so routing the user's send through it would spend funds other than
the ones on screen. Upgrading is never a side effect of sending — `canBatch`
stays false until the user opts in on the Smart account screen.

A dApp's `wallet_sendCalls` may upgrade the account, which is what
`atomic: "ready"` advertises in the capability response. That is permitted by
EIP-5792, but it changes the account permanently, so the approval screen says
so explicitly (`DappBatchView.upgradesAccount`) instead of leaving it implicit.

**Only the EIP-7702 kind is offered in the UI.** The counterfactual providers
are implemented and tested in `chain-evm`, but everything above the chain layer
— balances, the receive screen, the accounts list — is single-address. Offering
an upgrade into an account whose funds the wallet then couldn't show, and whose
sends `canBatch` would refuse to route, is a dead end; the picker lists them
with that reason attached rather than pretending otherwise.

`revokeDelegation` (`aa/revoke.ts`) clears a 7702 delegation by authorizing
the zero address. It is a plain type-4 transaction rather than a User
Operation: the account is leaving the smart-account world, so routing the exit
through that machinery would be circular. The authorization is prepared with
`executor: "self"`, which is load-bearing — when the EOA both signs and sends,
the authorization nonce must be one ahead of the account nonce, and getting
that wrong yields an authorization the chain silently ignores.

## Security invariants

Nine invariants the code depends on for key safety, at their current
locations (the wallet layer is decomposed from what used to be a single
`wallet.ts`, so several of them live in the manager files today):

| #   | Invariant                                                                                                       | Current location                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | A private key never escapes the callback scope that receives it                                                 | `AccountManager.withPrivateKey` — `packages/core/src/wallet/account-manager.ts:45-56` (try/finally + `zero()`); `AccountManager.get` zeros the derived key before returning it — `account-manager.ts:20-27`; `ImportedKeyManager.withPrivateKey` — `packages/core/src/wallet/imported-key-manager.ts:68-81` (same try/finally + `zero()` discipline)                                                               |
| 2   | `lock()` atomically zeros all three account categories (HD keyring, additional seeds, imported keyrings)        | `packages/core/src/wallet/wallet.ts:197-209`                                                                                                                                                                                                                                                                                                                                                                       |
| 3   | `wipe()` zeros both the key buffer and the pointer to it; any reuse after `wipe()` throws                       | `packages/core/src/keyring/hd-keyring.ts:41-52`; `packages/core/src/keyring/imported-keyring.ts:36-48` (keyrings were out of scope for the decomposition — unchanged)                                                                                                                                                                                                                                              |
| 4   | `Vault` never retains decrypted secrets beyond a single call; the only thing it stores is ciphertext            | `packages/core/src/vault/vault.ts:103-118` (`open()`'s `finally { zero(...) }`); `packages/core/src/vault/types.ts:32-37` (`SerializedVault` holds `version`/`kdf`/`nonce`/`ciphertext` only)                                                                                                                                                                                                                      |
| 5   | A fresh AES-GCM nonce is generated on every `seal()`                                                            | `packages/core/src/vault/vault.ts:120-131`                                                                                                                                                                                                                                                                                                                                                                         |
| 6   | The BIP-39 passphrase is never persisted — supplied fresh on every `unlock()`, kept in memory only              | `packages/core/src/vault/types.ts:11-24` (`SeedRecord`/`VaultSecrets` carry no passphrase field); `packages/core/src/wallet/wallet.ts:162-175` (`unlock()`'s `passphrase` parameter and docblock)                                                                                                                                                                                                                  |
| 7   | A mnemonic is validated strictly before it's persisted                                                          | `Wallet.import` — `packages/core/src/wallet/wallet.ts:110-125` (`validateMnemonic` at `:120`, before `storage.save()` at `:125`); `SeedManager.persistSeed` — `packages/core/src/wallet/seed-manager.ts:36-49` (`validateMnemonic` at `:44`, before `internals.commit` at `:49`)                                                                                                                                   |
| 8   | Guards against silently overwriting an existing entry (fail fast instead)                                       | dup `coin.id` — `packages/core/src/wallet/wallet.ts:70-76` (constructor); dup `(coinId, address)` — `packages/core/src/vault/vault.ts:56-64` (`addImportedKey`); dup `seed.id` — `packages/core/src/vault/vault.ts:79-84` (`addSeed`); dup chain adapter `id` (added in this refactor) — `packages/core/src/chain/registry.ts:21-26` (`ChainRegistry.register`)                                                    |
| 9   | `Vault` stays below the `Wallet`/chain layer: it has no notion of `CoinEntry`, `HdKeyring`, or a `ChainAdapter` | `packages/core/src/vault/vault.ts:13-20` (class docblock) and `:1-9` (its import list has none of those); enforced at lint time by the `packages/core/**` boundary block in `eslint.config.mjs:78-96` (forbids importing `@openwallet/chain-*` from core); `packages/core/src/chain/registry.ts` only imports the `ChainAdapter` type and never touches `Vault`, so the boundary holds for the chain layer as well |

## Adding a new chain

The compiler and lint enforce the shape; this is the order that satisfies
both on the first pass. Use `chain-evm`, `chain-solana`, or `chain-bitcoin`
as templates throughout — pick whichever is closest to the new chain's
model (RPC client vs. injected providers, tiered vs. scalar fees, token
layer or not).

1. Scaffold `packages/chain-<name>/` with its own `package.json`,
   `tsconfig.json` / `tsconfig.test.json` (both extending root
   `tsconfig.base.json`, following `chain-evm/tsconfig*.json`), and a
   `vitest.config.ts` that spreads `sharedTest` from root `vitest.shared.ts`
   (see `chain-evm/vitest.config.ts`) — this is the single source of the
   30s test timeout, so don't redefine it locally.
2. `src/constants.ts` — the chain's SLIP-44 coin type and any other magic
   numbers (`chain-evm/src/constants.ts`).
3. `src/errors.ts` — re-export or extend `@openwallet/core`'s `BaseError`
   family as needed (`chain-evm/src/errors.ts` is a one-line re-export).
4. `src/types.ts` — chain-specific request/response shapes, including a
   `Fees` type that matches this chain's actual fee model (see "Fees are
   intentionally chain-specific" — don't default to copying `FeeTiers`).
5. `src/coin.ts` — implement `CoinEntry` from `@openwallet/core`
   (`import type { CoinEntry } from "@openwallet/core"`): `id`, `curve`,
   `derivationPath(accountIndex)`, `deriveAddress(publicKey)`. Template:
   `chain-evm/src/coin.ts` (secp256k1) or `chain-bitcoin/src/coin.ts`
   (p2wpkh address encoding).
6. `src/validate.ts` — a pure, syntactic `isValidAddress(address): boolean`
   with no network calls.
7. `src/sign.ts` — sign a transaction and a message from a raw private-key
   `Uint8Array`. Never accept a keyring here — invariant 1 depends on
   private keys only ever reaching chain code from inside a
   `withPrivateKey` callback.
8. `src/transfer.ts` — build and broadcast a native-currency transfer.
9. `src/fee-tiers.ts` or `src/fee.ts` — whichever file name matches the
   shape chosen in step 4 (tiered vs. scalar); this is the one place the
   plan intentionally keeps the file name chain-specific.
10. If the chain has a token layer, add a transfer module for it
    (`erc20.ts`, `spl-token.ts`).
11. If the chain needs platform-supplied data sources the package can't
    reasonably hardcode (an indexer, a fee oracle, a broadcast endpoint),
    add `src/providers.ts` with small DI interfaces, following
    `chain-bitcoin/src/providers.ts`.
12. `src/adapter.ts` — define `<Name>ChainTypes extends ChainTypes` (all
    seven fields) and `createXxxAdapter(...)`, wrapping the standalone
    functions from the steps above. Declare every send-flow member with
    **method syntax**, never a function-typed property (see
    [CONTRIBUTING.md](../CONTRIBUTING.md)) — the registry upcast depends on
    it. `ChainAdapter<T>`'s method signatures force this shape at compile
    time; there's no way to half-implement it and still typecheck.
13. `src/index.ts` — export every public function and type, plus
    `createXxxAdapter` and `<Name>ChainTypes`.
14. Add `test/<name>.test.ts` per `src/<name>.ts`, mirroring the layout in
    `chain-evm/test`, `chain-solana/test`, or `chain-bitcoin/test`.
15. Register the new package where workspace-wide tools need an explicit
    entry: `knip.json`'s `workspaces` map is keyed by literal package path
    (not a glob), so add `"packages/chain-<name>": { "project": "src/**" }`
    there. `eslint.config.mjs`'s `packages/chain-*/**/*.ts` block and root
    `vitest.config.ts`'s `"packages/*"` project glob already cover any new
    package by pattern — no edit needed for either.
16. Optionally extend `test/integration/chain-agnostic-send.test.ts` to
    register the new adapter alongside the existing three, if it should
    participate in the chain-agnostic send-flow test.

`unicorn/filename-case` (kebab-case) and the `no-restricted-imports`
boundary rules apply to the new package automatically, the same as for the
existing three.
