import tseslint from "typescript-eslint";

// The root ESLint config ignores apps/**, so this adds the one rule the
// extension needs: the popup UI stays implementation-independent. It may reach
// the background only through messaging/client, never a chain SDK or a
// background/config module, so the popup bundle carries no crypto/core code.
export default tseslint.config(
  {
    ignores: ["node_modules/**", ".wxt/**", ".output/**"],
  },
  {
    files: ["src/ui/**/*.{ts,tsx}", "entrypoints/popup/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["viem", "viem/*", "@solana/web3.js", "bitcoinjs-lib", "@openwallet/*"],
              message:
                "UI must stay implementation-independent. No chain/crypto/core libraries in the popup; reach the background through messaging/client instead.",
            },
            {
              group: ["**/background/**", "**/config/**", "**/platform/**"],
              message:
                "UI must not import background/config/platform modules. Use the typed message client (messaging/client); those layers run in the service worker.",
            },
          ],
        },
      ],
    },
  },
);
