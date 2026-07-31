import { defineConfig, type WxtUnimportOptions } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // nodePolyfills gives Buffer/global to @solana/web3.js and bitcoinjs-lib,
  // which assume Node; without it those packages don't bundle.
  vite: () => ({ plugins: [tailwindcss(), nodePolyfills()] }),
  // WXT's auto-import excludes only node_modules by default. Our workspace
  // packages resolve to packages/*/dist and slip through, getting their code
  // rewritten and breaking the bundle. Exclude them too. The cast covers a gap
  // in WXT's public type (the underlying unplugin honors `exclude`).
  imports: {
    eslintrc: { enabled: false },
    exclude: [/[\\/]node_modules[\\/]/, /[\\/]packages[\\/][^\\/]+[\\/]dist[\\/]/],
  } as WxtUnimportOptions,
  manifest: {
    name: "OpenWallet",
    description: "A multi-chain, non-custodial crypto wallet.",
    // storage persists the vault; alarms drives durable auto-lock; tabs lets the
    // background push provider events to connected dApp tabs.
    permissions: ["storage", "alarms", "tabs"],
    // Lets the background fetch arbitrary RPC endpoints (bypassing CORS in MV3).
    host_permissions: ["https://*/*"],
    // The content script injects this into the page (MAIN world) to expose the
    // EIP-1193 provider, so it must be web-accessible.
    web_accessible_resources: [
      { resources: ["inpage.js"], matches: ["http://*/*", "https://*/*"] },
    ],
  },
});
