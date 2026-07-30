import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { walletApi } from "../../messaging/client.js";
import { AssetKind, type AssetView } from "../../messaging/protocol.js";
import { formatUnits } from "../format/units.js";
import { formatUsd } from "../format/usd.js";
import { TokenIcon } from "./primitives.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./shadcn/dropdown-menu.js";

// Fetches the native gas reserve once per network, so "Max" on the native asset
// leaves enough for the fee. null until loaded (Max then falls back to balance).
export function useFeeReserve(networkId: string, intent: "transfer" | "swap"): string | null {
  const [reserveWei, setReserveWei] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setReserveWei(null);
    walletApi.getFeeReserve(intent).then(
      (result) => {
        if (live) setReserveWei(result.reserveWei);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [networkId, intent]);
  return reserveWei;
}

// The most sendable amount as a full-precision decimal string: balance for a
// token, balance minus the gas reserve for the native asset.
export function maxAmount(asset: AssetView, reserveWei: string | null): string {
  const balance = BigInt(asset.balanceWei);
  const spendable =
    asset.kind === AssetKind.Native && reserveWei
      ? bigMax(balance - BigInt(reserveWei), 0n)
      : balance;
  return formatUnits(spendable.toString(), asset.decimals, asset.decimals);
}

function bigMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

// A token as a rounded pill (icon + symbol), optionally opening a picker.
export function TokenPill({
  asset,
  assets,
  exclude,
  onSelect,
}: {
  asset?: AssetView;
  assets?: readonly AssetView[];
  exclude?: string;
  onSelect?: (id: string) => void;
}): React.ReactElement {
  const face = (
    <>
      {asset ? <TokenIcon src={asset.iconUrl} symbol={asset.symbol} size={22} /> : null}
      <span className="text-sm font-semibold">{asset?.symbol ?? "Select"}</span>
      {onSelect ? <ChevronDown className="text-muted-foreground size-4" /> : null}
    </>
  );

  if (!onSelect || !assets) {
    return (
      <span className="bg-background flex shrink-0 items-center gap-1.5 rounded-full border py-1.5 pr-3 pl-1.5">
        {face}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="bg-background hover:bg-accent flex shrink-0 items-center gap-1.5 rounded-full border py-1.5 pr-3 pl-1.5 transition-colors">
          {face}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {assets
          .filter((option) => option.id !== exclude)
          .map((option) => (
            <DropdownMenuItem key={option.id} onClick={() => onSelect(option.id)}>
              <TokenIcon src={option.iconUrl} symbol={option.symbol} size={20} />
              {option.symbol}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// A DEX-style amount card: label + balance/Max on top, big input + token pill,
// USD value underneath.
export function AmountPanel({
  label,
  asset,
  amount,
  onAmountChange,
  onMax,
  readOnly = false,
  pill,
}: {
  label: string;
  asset?: AssetView;
  amount: string;
  onAmountChange?: (value: string) => void;
  onMax?: () => void;
  readOnly?: boolean;
  pill: React.ReactNode;
}): React.ReactElement {
  const balance = asset ? formatUnits(asset.balanceWei, asset.decimals) : null;
  const usd =
    asset && asset.priceUsd !== null && Number(amount) > 0
      ? formatUsd(Number(amount) * asset.priceUsd)
      : null;

  return (
    <div className="bg-card flex flex-col gap-2 rounded-xl border p-3">
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        {balance !== null ? (
          <span>
            Balance: <span className="tabular-nums">{balance}</span>
            {onMax ? (
              <button
                type="button"
                className="text-primary ml-1.5 font-semibold hover:underline"
                onClick={onMax}
              >
                Max
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <input
          className="placeholder:text-muted-foreground/40 min-w-0 flex-1 bg-transparent text-2xl font-semibold tabular-nums outline-none"
          value={amount}
          placeholder="0"
          inputMode="decimal"
          readOnly={readOnly}
          onChange={(event) => onAmountChange?.(event.target.value)}
        />
        {pill}
      </div>
      <div className="text-muted-foreground text-xs tabular-nums">{usd ?? " "}</div>
    </div>
  );
}
