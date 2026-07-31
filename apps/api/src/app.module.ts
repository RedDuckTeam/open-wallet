import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { CacheModule } from "@nestjs/cache-manager";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { HealthController } from "./health.controller.js";
import { TokensModule } from "./tokens/tokens.module.js";
import { PricesModule } from "./prices/prices.module.js";
import { SwapModule } from "./swap/swap.module.js";

// Composition root. Config and cache are global so feature modules inject them
// without re-importing. Each data source (tokens/prices/swap) is its own module.
// ThrottlerGuard is global: every route here proxies a paid, keyed upstream
// (LI.FI/CoinGecko), so nothing should be reachable without a per-IP limit.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CacheModule.register({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    TokensModule,
    PricesModule,
    SwapModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
