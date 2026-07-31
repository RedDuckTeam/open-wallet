# Contributing

This is a pnpm workspace. See the [README](README.md) for the package list
and the day-to-day commands, and [docs/architecture.md](docs/architecture.md)
for how the packages fit together and why. This document covers code
conventions, what's enforced automatically, and how CI gates a change.

## Code conventions

- **Naming: kebab-case filenames**, enforced by `unicorn/filename-case` in
  `eslint.config.mjs` (`case: "kebabCase"`) across every `.ts` file in the
  workspace.
- **No `any`.** `@typescript-eslint/no-explicit-any` is an error. If a type
  is genuinely unknown at that point, use `unknown` and narrow it — this is
  exactly how `ChainAdapter`'s default `ChainTypes` erases concrete chain
  types without resorting to `any` (see `docs/architecture.md`).
- **Explicit function return types.** `@typescript-eslint/explicit-function-return-type`
  is an error, so every function's return type is written out rather than
  inferred.
- **No silent stringification of secrets.** `@typescript-eslint/restrict-template-expressions`
  is an error. Private keys, mnemonics, and passwords must never end up
  silently coerced into a template literal or a log line.
- **Method syntax on `ChainAdapter`'s send-flow operations — normative, not
  a style choice.** `buildTransfer`, `estimateFees`, `sign`, `broadcast`,
  `getNativeBalance`, and `signMessage` on `ChainAdapter` must be declared
  as methods (`sign(unsigned, key): ...`), never as function-typed
  properties (`sign: (unsigned, key) => ...`). Upcasting a concrete
  `ChainAdapter<EvmChainTypes>` to the registry's all-`unknown` `ChainAdapter`
  relies on the parameter _bivariance_ TypeScript grants to method syntax
  only. As function-typed properties, `strictFunctionTypes` would make those
  parameters contravariant and reject the upcast outright, breaking
  `ChainRegistry.register`. Any new chain's `adapter.ts` must follow the
  same convention — see the existing `chain-evm`, `chain-solana`, and
  `chain-bitcoin` adapters for the pattern.

## Package boundaries

Enforced by typed `no-restricted-imports` rules in `eslint.config.mjs`, not
just convention:

- `packages/core` must never import an `@openwallet/chain-*` package.
- A `chain-*` package must never import another `chain-*` package — the
  only shared dependency across chains is `@openwallet/core`.
- No deep imports into any workspace package — always import from a
  package's root (`@openwallet/core`), never `@openwallet/core/src/...` or
  `@openwallet/core/dist/...`. `exports`/`main` are the only public surface.

The one intentional exception is `test/integration/`, which sits outside
`packages/` so it can legally import all three chain packages at once to
exercise the chain-agnostic send flow.

## Test layout

`test/` mirrors `src/` inside each package — `src/transfer.ts` is exercised
by `test/transfer.test.ts`, and so on (see any of `packages/chain-evm/test`,
`packages/chain-solana/test`, `packages/chain-bitcoin/test`,
`packages/core/test`). There's no enforced coverage threshold; the
convention is about where a test file lives, not how much of the file it
must cover.

Root `vitest.config.ts` declares `projects: ["packages/*", ...]` plus one
inline project for `test/integration` (that directory has no vitest config
of its own — the boundary rule scoping "chain packages can't import each
other" only applies to `packages/chain-*`, so the integration harness is the
one place all three chains can be imported together).

**Test timeouts have one source of truth.** Root `vitest.shared.ts` exports
`sharedTest = { testTimeout: 30_000 }`. Every package's own
`vitest.config.ts` just spreads it (`{ test: { ...sharedTest } }`) rather
than redefining `testTimeout` locally — so running a single package in
isolation (`pnpm --filter <pkg> test`) still uses the same timeout CI does.
Don't add a package-local timeout override.

## What's enforced automatically

These are checked by tooling, not code review — don't spend review comments
on them:

- **Import boundaries** — `@typescript-eslint/no-restricted-imports` (see
  "Package boundaries" above).
- **Filename case** — `unicorn/filename-case` (kebab-case everywhere).
- **Unused exports/files** — `knip`. Its `knip.json` lists each package
  under `workspaces` by literal path (not a glob); a newly added package
  needs its own entry there or knip won't check it at all.
- **Strict TypeScript** — every package's `tsconfig.json` extends root
  `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`, `isolatedModules`.
- **Typed ESLint rules** — `explicit-function-return-type`,
  `restrict-template-expressions`, `no-explicit-any` (see "Code
  conventions" above).
- **Formatting** — Prettier is the single source of truth for style;
  `eslint-config-prettier` (last in `eslint.config.mjs`) turns off every
  ESLint rule that could disagree with it. Prettier also formats
  Markdown — `.prettierignore` only excludes `node_modules/`, `dist/`,
  `coverage/`, and `pnpm-lock.yaml`, so run `pnpm format` after editing
  docs.

## CI gate order

`pnpm run check` and CI (`.github/workflows/ci.yml`) both run the same
gates, in this order:

```
format → build → lint → typecheck → knip → test
```

Build runs before lint/typecheck/knip/test because chain packages resolve
`@openwallet/core` through its built `dist/` output — without a build,
cross-package types aren't visible yet. `pnpm run check` runs all six in
sequence; use it before opening a PR.
