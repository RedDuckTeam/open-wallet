import React, { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Globe,
  MoreVertical,
  Plus,
  Settings,
} from "lucide-react";
import { walletApi } from "../../messaging/client.js";
import {
  AssetKind,
  ChainKind,
  type AccountView,
  type AssetView,
  type WalletStatus,
} from "../../messaging/protocol.js";
import { formatUnits, unitsToNumber } from "../format/units.js";
import { formatUsd } from "../format/usd.js";
import { truncateAddress } from "../format/text.js";
import { useAssets } from "../state/assets.js";
import { Avatar, Callout, NetworkDot, TokenIcon } from "../components/primitives.js";
import { Button } from "../components/shadcn/button.js";
import { Skeleton } from "../components/shadcn/skeleton.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/shadcn/dropdown-menu.js";

export type HomeView =
  | "send"
  | "receive"
  | "accounts"
  | "networks"
  | "addToken"
  | "settings"
  | "smartAccount"
  | "nfts"
  | "connectedSites";

// USD value of a holding, or null when it has no price (e.g. testnets).
function valueUsd(asset: AssetView): number | null {
  return asset.priceUsd === null
    ? null
    : unitsToNumber(asset.balanceWei, asset.decimals) * asset.priceUsd;
}

// True when a holding has a real balance but no price, so the total that sums
// it in as 0 is understating net worth rather than reflecting a genuine zero.
// A zero-balance asset lacking a price doesn't matter either way.
function hasMissingPrice(asset: AssetView): boolean {
  return asset.priceUsd === null && BigInt(asset.balanceWei) !== 0n;
}

export function Home({
  status,
  account,
  onNav,
}: {
  status: WalletStatus;
  account: AccountView;
  onNav: (view: HomeView) => void;
}): React.ReactElement {
  const { assets, error, reload } = useAssets();
  const total = (assets ?? []).reduce((sum, asset) => sum + (valueUsd(asset) ?? 0), 0);
  const totalIncomplete = (assets ?? []).some(hasMissingPrice);

  return (
    <div className="flex flex-1 flex-col">
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b px-3 py-2.5">
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-full px-2.5"
          onClick={() => onNav("networks")}
        >
          <NetworkDot color={status.network.color} />
          {status.network.name}
          <ChevronDown className="text-muted-foreground" />
        </Button>
        <button
          className="flex items-center justify-center gap-2 hover:opacity-80"
          onClick={() => onNav("accounts")}
        >
          <Avatar seed={account.address} size={26} />
          <span className="flex flex-col items-start leading-tight">
            <span className="flex items-center gap-1 text-[13px] font-semibold">
              {account.name}
              <ChevronDown className="text-muted-foreground size-3" />
            </span>
            <span className="text-muted-foreground font-mono text-[11px]">
              {truncateAddress(account.address)}
            </span>
          </span>
        </button>
        <div className="flex items-center justify-self-end">
          <SiteIndicator onClick={() => onNav("connectedSites")} />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onNav("settings")}
            aria-label="Settings"
          >
            <Settings />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-col items-center py-1">
          {assets === null ? (
            <Skeleton className="h-10 w-40" />
          ) : (
            <>
              <span className="text-[34px] font-bold tracking-tight tabular-nums">
                {totalIncomplete ? <span aria-hidden="true">~</span> : null}
                {formatUsd(total)}
              </span>
              {totalIncomplete ? (
                <span className="text-muted-foreground text-[11px]">
                  Some prices unavailable — total may be incomplete
                </span>
              ) : null}
            </>
          )}
        </div>

        <div className="flex gap-2.5">
          <Button className="flex-1" onClick={() => onNav("send")}>
            <ArrowUpRight />
            Send
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => onNav("receive")}>
            <ArrowDownLeft />
            Receive
          </Button>
        </div>

        {error ? <Callout>{error}</Callout> : null}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Assets
            </span>
            <div className="flex items-center gap-3">
              {/* NFTs live behind their own screen rather than mixed into the
                  asset list: they're grid-shaped, not row-shaped, and the list
                  is sorted by USD value, which an NFT doesn't have. */}
              {status.network.kind === ChainKind.Evm ? (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => onNav("nfts")}
                >
                  Collectibles
                </Button>
              ) : null}
              {status.network.supportsTokens ? (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => onNav("addToken")}
                >
                  <Plus />
                  Add token
                </Button>
              ) : null}
            </div>
          </div>

          {assets === null ? (
            <div className="flex flex-col gap-1.5">
              <AssetSkeleton />
              <AssetSkeleton />
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {assets.map((asset) => (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  onRemove={
                    asset.kind === AssetKind.Token
                      ? () => {
                          void walletApi.removeToken(asset.id).then(reload);
                        }
                      : undefined
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// Header entry to connected sites; a green dot marks that the current tab's dApp
// is connected.
function SiteIndicator({ onClick }: { onClick: () => void }): React.ReactElement {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    walletApi.activeSiteConnection().then(
      (site) => setConnected(site.connected),
      () => setConnected(false),
    );
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={onClick}
      aria-label="Connected sites"
      title={connected ? "Connected to this site" : "Connected sites"}
    >
      <Globe className={connected ? "text-success" : undefined} />
      {connected ? (
        <span className="bg-success ring-background absolute top-1.5 right-1.5 size-2 rounded-full ring-2" />
      ) : null}
    </Button>
  );
}

function AssetSkeleton(): React.ReactElement {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <Skeleton className="size-9 rounded-full" />
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="ml-auto h-3.5 w-14" />
    </div>
  );
}

function AssetRow({
  asset,
  onRemove,
}: {
  asset: AssetView;
  onRemove?: () => void;
}): React.ReactElement {
  const value = valueUsd(asset);
  const amount = `${formatUnits(asset.balanceWei, asset.decimals)} ${asset.symbol}`;

  return (
    <li className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <TokenIcon src={asset.iconUrl} symbol={asset.symbol} size={36} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold">{asset.symbol}</span>
        <span className="text-muted-foreground truncate text-[12px]">{asset.name}</span>
      </span>
      <span className="ml-auto flex flex-col items-end leading-tight tabular-nums">
        {value === null ? (
          <span className="text-sm font-semibold">{amount}</span>
        ) : (
          <>
            <span className="text-sm font-semibold">{formatUsd(value)}</span>
            <span className="text-muted-foreground text-[12px]">{amount}</span>
          </>
        )}
      </span>
      {onRemove ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-7"
              aria-label={`${asset.symbol} options`}
            >
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={onRemove}>
              Remove token
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  );
}
