# @openwallet/api

The OpenWallet data backend. A NestJS service that serves the extension the data
it should not fetch (or hold keys for) itself: token lists, USD prices, and swap
quotes. Third-party keys (CoinGecko, LI.FI) live here, and slow-moving data is
cached server-side so many clients don't hammer the upstreams.

This is the same pattern larger wallets use: the client stays thin and provider-
agnostic; the backend owns integrations, caching, and keys. It is self-hostable,
so the extension's `WXT_API_URL` can point at your own deployment.

## Boundary with the extension

The rule: **this service never touches a private key or builds/signs/broadcasts
a transaction.** If it needs a signature, it isn't API work — it belongs in
`apps/extension/src/background` (through `packages/chain-evm` etc., never
hand-rolled). Concretely:

- **Here**: fetching and parsing third-party data (CoinGecko, LI.FI), caching
  it, and (for swaps) returning an unsigned/signable execution plan.
- **Extension**: everything after that plan arrives — building the actual
  transaction, signing it, broadcasting it, and any chain-specific execution
  logic (approvals, gas).

Keeping this explicit is what stops transaction-building logic from drifting
into two places at once — it used to be re-implemented separately in the
extension's dApp signer and its swap executor instead of both going through
`packages/chain-evm`.

## Endpoints

Contract (request/response schemas) lives in `packages/api-contract`.

| Route                   | Purpose                                    | Cache |
| ----------------------- | ------------------------------------------ | ----- |
| `GET /health`           | Liveness                                   | –     |
| `GET /v1/tokens`        | Token registry for a chain                 | 1h    |
| `GET /v1/tokens/search` | Ranked token search                        | 1h\*  |
| `GET /v1/prices/native` | USD prices by CoinGecko id                 | 60s   |
| `GET /v1/prices/tokens` | USD prices by contract address             | 60s   |
| `GET /v1/swap/quote`    | Same-chain swap quote + signable execution | none  |

\*search reuses the cached per-chain list. Swap quotes carry a time-sensitive tx
and are intentionally never cached.

## Run

```sh
cp .env.example .env      # optional: add CoinGecko / LI.FI keys to raise limits
pnpm --filter @openwallet/api build
pnpm --filter @openwallet/api start   # or: dev (watch)
```

Defaults to `:3001`. CORS is open by default (data is public/read-only); set
`CORS_ORIGIN` (comma-separated) to restrict it. Every route is rate-limited
(30 req/min/IP) since this is the layer that holds the CoinGecko/LI.FI keys —
that's the real guard against quota abuse, not CORS.
