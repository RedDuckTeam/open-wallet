import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // apps/** are WXT/Vite browser apps with their own toolchain (auto-imported
    // globals like `defineBackground`/`browser`, JSX, a browser env). They aren't
    // part of the library packages' TS programs this type-aware config targets;
    // each app is covered by its own `tsc --noEmit` typecheck script instead.
    ignores: ["**/dist/**", "**/node_modules/**", "**/.wxt/**", "**/.output/**", "apps/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ["./packages/*/tsconfig.test.json", "./test/integration/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Secrets (private keys, mnemonics, passwords) must never be
      // silently coerced to strings via template literals or logged.
      "@typescript-eslint/restrict-template-expressions": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": "error",
      "no-console": "warn",
    },
  },
  {
    // The extension unit tests import app *source* (the extension is an app, not
    // a built package), which belongs to WXT's TS program, not this type-aware
    // one — so lint them without type info rather than pull that program in.
    files: [
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
      "**/*.config.{ts,mts,cts}",
      "vitest.shared.ts",
      "test/extension/**/*.ts",
      "test/api/**/*.ts",
    ],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // `ecpair`'s types are built on deeply nested valibot conditional types;
    // typescript-eslint's per-node `getTypeAtLocation` calls resolve those to
    // an error type here even though `tsc --noEmit` on the same tsconfig (and
    // this file's own runtime tests) confirm the types are sound. Narrow,
    // file-scoped workaround for a type-checker limitation, not a real gap —
    // applies to every file that touches the shared `ECPair` instance.
    files: [
      "packages/chain-bitcoin/src/ecc.ts",
      "packages/chain-bitcoin/src/sign.ts",
      "packages/chain-bitcoin/src/wif.ts",
    ],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  {
    // Chain packages sit side by side on purpose (one per chain family) and
    // must stay independent of one another; the only shared dependency is
    // `@openwallet/core`. Deep imports (reaching past a package's `dist`
    // entry point into its internals) are forbidden for every workspace
    // package so `exports`/`main` stay the single public surface.
    files: ["packages/chain-*/**/*.ts"],
    rules: {
      // The typed rule below supersedes the base rule; the base must be off
      // or it double-reports every match.
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@openwallet/chain-*"],
              message: "chain packages must never import each other",
            },
            {
              group: ["@openwallet/*/src/*", "@openwallet/*/dist/*", "@openwallet/*/*"],
              message: "no deep imports — import from the package root",
            },
          ],
        },
      ],
    },
  },
  {
    // core is the chain-agnostic foundation; it must never depend on a
    // specific chain implementation (`chain-* → core`, never the reverse).
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@openwallet/chain-*"],
              message: "core must stay chain-agnostic — do not import @openwallet/chain-* packages",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.ts"],
    plugins: { unicorn: eslintPluginUnicorn },
    rules: {
      "unicorn/filename-case": ["error", { case: "kebabCase" }],
    },
  },
  // Must stay LAST: turns off every ESLint rule that would fight Prettier's
  // formatting, so Prettier is the single source of truth for style and the
  // two never disagree in a pre-commit/CI check.
  eslintConfigPrettier,
);
