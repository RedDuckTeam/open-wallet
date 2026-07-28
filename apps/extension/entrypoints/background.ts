import { defineBackground } from "#imports";
import { evmCoin } from "@openwallet/chain-evm";
import { solanaCoin } from "@openwallet/chain-solana";
import { bitcoinCoin, bitcoinTestnetCoin } from "@openwallet/chain-bitcoin";
import { env } from "../src/config/env.js";
import { ExtensionVaultStorage } from "../src/platform/storage.js";
import { SettingsStorage } from "../src/platform/settings-storage.js";
import { WalletService } from "../src/background/services/wallet-service.js";
import { SettingsService } from "../src/background/services/settings-service.js";
import { BackendClient } from "../src/background/adapters/backend.js";
import { BackendPriceProvider } from "../src/background/adapters/backend-price-provider.js";
import { CoinGeckoPriceProvider } from "../src/background/adapters/coingecko.js";
import { PriceService } from "../src/background/adapters/price-service.js";
import { createChainService } from "../src/background/chains.js";
import { createSwapService } from "../src/background/swap.js";
import { registerDapp } from "../src/background/dapp/register.js";
import { registerHandlers } from "../src/background/handlers.js";

// Composition root: register every chain's CoinEntry with the keyring, build the
// chain service (core adapters) and price provider, and wire them to the
// protocol. Adding a chain touches only this file, its CoinEntry, and chains.ts.
export default defineBackground(() => {
  const wallet = new WalletService({
    coins: [evmCoin, solanaCoin, bitcoinCoin, bitcoinTestnetCoin],
    storage: new ExtensionVaultStorage(),
  });
  const chains = createChainService();
  const backend = new BackendClient(env.apiBaseUrl);
  const swap = createSwapService(backend);
  const settings = new SettingsService(new SettingsStorage());
  // Backend first (keyed + cached), with direct CoinGecko as an offline-of-backend
  // fallback so USD values keep working; PriceService adds the short client-side
  // cache on top of whichever source answers.
  const prices = new PriceService([
    new BackendPriceProvider(backend),
    new CoinGeckoPriceProvider(),
  ]);
  const dapp = registerDapp({ wallet, settings });

  registerHandlers({ wallet, chains, swap, settings, prices, dapp });
  void settings.init();
});
