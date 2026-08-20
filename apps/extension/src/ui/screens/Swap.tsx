import React, { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, CheckCircle2, ChevronDown, Search } from "lucide-react";
import { walletApi } from "../../messaging/client.js";
import {
  NATIVE_ASSET_ID,
  WalletErrorCode,
  type AssetView,
  type NetworkView,
  type SendResult,
  type SwapQuoteView,
  type SwapTokenView,
} from "../../messaging/protocol.js";
import { errorMessage } from "../format/error.js";
import { toBaseUnits } from "../../units.js";
import {
  DEFAULT_SLIPPAGE_PCT,
  HIGH_SLIPPAGE_PCT,
  SLIPPAGE_PRESETS_PCT,
  validateSlippagePct,
} from "../../slippage.js";
import { formatUnits } from "../format/units.js";
import { useAssets } from "../state/assets.js";
import { AmountPanel, TokenPill, maxAmount, useFeeReserve } from "../components/amount.js";
import { Callout, Spinner, TokenIcon } from "../components/primitives.js";
import { Button } from "../components/shadcn/button.js";
import { Card } from "../components/shadcn/card.js";
import { Input } from "../components/shadcn/input.js";
import { Separator } from "../components/shadcn/separator.js";

const QUOTE_TTL_MS = 60_000;

function Header(): React.ReactElement {
  return (
    <header className="border-b px-4 py-3.5">
      <h1 className="text-center text-[15px] font-semibold">Swap</h1>
    </header>
  );
}

export function Swap({ network }: { network: NetworkView }): React.ReactElement {
  const { assets } = useAssets();

  if (!network.supportsTokens) {
    return (
      <div className="flex flex-1 flex-col">
        <Header />
        <div className="text-muted-foreground flex flex-1 items-center justify-center p-6 text-center text-sm">
          Swaps are available on Ethereum and other EVM networks, and on Solana. Switch networks to
          swap.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <Header />
      {assets === null ? (
        <div className="flex flex-1 justify-center py-8">
          <Spinner className="text-muted-foreground size-6" />
        </div>
      ) : (
        <SwapForm key={network.id} network={network} assets={assets} />
      )}
    </div>
  );
}

function SwapForm({
  network,
  assets,
}: {
  network: NetworkView;
  assets: readonly AssetView[];
}): React.ReactElement {
  const { reload } = useAssets();
  const [fromId, setFromId] = useState(NATIVE_ASSET_ID);
  const [toToken, setToToken] = useState<SwapTokenView | null>(null);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<SwapQuoteView | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slippagePct, setSlippagePct] = useState(DEFAULT_SLIPPAGE_PCT);
  const quotedAt = useRef(0);
  const reserveWei = useFeeReserve(network.id, "swap");

  const from = assets.find((a) => a.id === fromId) ?? assets[0];

  useEffect(() => {
    void walletApi.getSwapSlippage().then(({ pct }) => setSlippagePct(pct));
  }, []);

  /**
   * A quote is a snapshot of a moving price and its route has a lifetime of
   * its own (a Solana blockhash lives about a minute) — after 60s it is
   * withdrawn rather than left looking confirmable. Skipped once a result is
   * up: that route is already spent, and expiring it behind the success
   * screen would greet the user with a stale error.
   */
  useEffect(() => {
    if (!quote || result) return;
    const remaining = quotedAt.current + QUOTE_TTL_MS - Date.now();
    const timer = setTimeout(
      () => {
        setQuote(null);
        setError("The quote expired. Prices move — get a fresh one.");
      },
      Math.max(0, remaining),
    );
    return () => clearTimeout(timer);
  }, [quote, result]);

  if (result) {
    return (
      <Done
        result={result}
        onDone={() => {
          setResult(null);
          setQuote(null);
          setAmount("");
        }}
      />
    );
  }

  if (picking) {
    return (
      <TokenSearch
        onPick={(token) => {
          setToToken(token);
          setPicking(false);
          setQuote(null);
        }}
        onBack={() => setPicking(false)}
      />
    );
  }

  const review = async (): Promise<void> => {
    setError(null);
    if (!from || !toToken) return setError("Pick a token to swap to.");
    if (!(Number(amount) > 0)) return setError("Enter an amount greater than 0.");
    // The same exact base-unit comparison the send screen makes: a lossy
    // float comparison could disagree with the swap itself right at the
    // balance boundary, and an aggregator error about funds is far less
    // clear than saying it here.
    if (toBaseUnits(amount, from.decimals) > BigInt(from.balanceWei)) {
      return setError("Amount exceeds your balance.");
    }
    setBusy(true);
    try {
      const fresh = await walletApi.getSwapQuote(
        { address: from.address, decimals: from.decimals },
        { address: toToken.address, decimals: toToken.decimals },
        amount,
      );
      quotedAt.current = Date.now();
      setQuote(fresh);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (): Promise<void> => {
    if (!quote) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await walletApi.executeSwap(quote.execution));
      reload();
    } catch (e) {
      setError(errorMessage(e));
      // A slippage or expiry failure means this exact route is spent —
      // retrying it can only fail again, so the quote is withdrawn and the
      // button goes back to "Get quote".
      const code = (e as { code?: string }).code;
      if (code === WalletErrorCode.SlippageExceeded || code === WalletErrorCode.QuoteExpired) {
        setQuote(null);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      {error ? <Callout>{error}</Callout> : null}

      <div className="relative flex flex-col gap-1.5">
        <AmountPanel
          label="You pay"
          asset={from}
          amount={amount}
          onAmountChange={(value) => {
            setAmount(value);
            setQuote(null);
          }}
          onMax={from ? () => setAmount(maxAmount(from, reserveWei)) : undefined}
          pill={<TokenPill asset={from} assets={assets} onSelect={setFromId} />}
        />

        <span className="bg-background absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-lg border p-1.5">
          <ArrowDown className="size-4" />
        </span>

        <AmountPanel
          label="You receive"
          amount={quote ? formatUnits(quote.toAmount, quote.toDecimals) : ""}
          readOnly
          pill={<ReceivePill token={toToken} onClick={() => setPicking(true)} />}
        />
      </div>

      <SlippageControl
        pct={slippagePct}
        onChange={(pct) => {
          setSlippagePct(pct);
          // The quote's minimum-received was computed with the old
          // tolerance — confirming it now would promise the wrong floor.
          setQuote(null);
        }}
        onError={setError}
      />

      {quote ? <QuoteDetails quote={quote} /> : null}

      {quote ? (
        <Button className="w-full" disabled={busy} onClick={() => void confirm()}>
          {busy ? <Spinner /> : null}
          Confirm swap
        </Button>
      ) : (
        <Button className="w-full" disabled={busy || !toToken} onClick={() => void review()}>
          {busy ? <Spinner /> : null}
          Get quote
        </Button>
      )}
    </div>
  );
}

// The receive-side token pill; opens the search picker. Shows "Select token"
// until one is chosen, which is why the receive list is never empty.
function ReceivePill({
  token,
  onClick,
}: {
  token: SwapTokenView | null;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-background hover:bg-accent flex shrink-0 items-center gap-1.5 rounded-full border py-1.5 pr-3 pl-1.5 transition-colors"
    >
      {token ? <TokenIcon src={token.iconUrl} symbol={token.symbol} size={22} /> : null}
      <span className="text-sm font-semibold">{token?.symbol ?? "Select token"}</span>
      <ChevronDown className="text-muted-foreground size-4" />
    </button>
  );
}

// Searchable token list from the backend registry. Empty query shows popular
// tokens, so there is always something to pick.
function TokenSearch({
  onPick,
  onBack,
}: {
  onPick: (token: SwapTokenView) => void;
  onBack: () => void;
}): React.ReactElement {
  const [query, setQuery] = useState("");
  const [tokens, setTokens] = useState<SwapTokenView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    const timer = setTimeout(() => {
      walletApi.swapTokens(query).then(
        (result) => {
          if (request.current !== id) return;
          setTokens(result);
          setFailed(false);
        },
        () => {
          if (request.current !== id) return;
          setTokens([]);
          setFailed(true);
        },
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <Button variant="ghost" size="icon" className="size-9" onClick={onBack} aria-label="Back">
          <ArrowLeft />
        </Button>
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            autoFocus
            value={query}
            placeholder="Search name or paste address"
            className="pl-8"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tokens === null ? (
          <div className="flex justify-center py-8">
            <Spinner className="text-muted-foreground size-5" />
          </div>
        ) : failed ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Swap service is unavailable. Try again later.
          </p>
        ) : tokens.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">No tokens found.</p>
        ) : (
          <ul className="flex flex-col">
            {tokens.map((token) => (
              <li key={token.address}>
                <button
                  type="button"
                  onClick={() => onPick(token)}
                  className="hover:bg-accent flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors"
                >
                  <TokenIcon src={token.iconUrl} symbol={token.symbol} size={32} />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-sm font-semibold">{token.symbol}</span>
                    <span className="text-muted-foreground truncate text-[12px]">{token.name}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Past this, the shortfall against market price stops being noise and deserves a warning. */
const PRICE_IMPACT_WARN_PCT = 5;

function QuoteDetails({ quote }: { quote: SwapQuoteView }): React.ReactElement {
  const impact = quote.priceImpactPct;
  return (
    <>
      <Card className="gap-0 py-0">
        <Row label="Rate" value={`1 ${quote.fromSymbol} ≈ ${rate(quote)} ${quote.toSymbol}`} />
        <Separator />
        <Row
          label="Min received"
          value={`${formatUnits(quote.toAmountMin, quote.toDecimals)} ${quote.toSymbol}`}
        />
        <Separator />
        <Row label="Route" value={quote.tool} />
        {impact !== null ? (
          <>
            <Separator />
            <Row label="Price impact" value={`${impact < 0.01 ? "< 0.01" : impact.toFixed(2)}%`} />
          </>
        ) : null}
        {quote.gasUsd !== null ? (
          <>
            <Separator />
            <Row label="Network fee" value={`~$${quote.gasUsd.toFixed(2)}`} />
          </>
        ) : null}
      </Card>
      {impact !== null && impact >= PRICE_IMPACT_WARN_PCT ? (
        <Callout tone="error">
          This trade moves the price by about {impact.toFixed(1)}% — you receive markedly less than
          the market rate. Usually a sign the pool is too thin for this amount.
        </Callout>
      ) : null}
    </>
  );
}

function rate(quote: SwapQuoteView): string {
  const from = Number(formatUnits(quote.fromAmount, quote.fromDecimals, quote.fromDecimals));
  const to = Number(formatUnits(quote.toAmount, quote.toDecimals, quote.toDecimals));
  return from > 0 ? (to / from).toFixed(4) : "0";
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function Done({ result, onDone }: { result: SendResult; onDone: () => void }): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="text-success size-12" />
        <p className="text-muted-foreground text-sm">
          Swap submitted. It may take a minute to confirm.
        </p>
      </div>
      {result.explorerUrl ? (
        <a
          className="text-primary text-center text-[13px] hover:underline"
          href={result.explorerUrl}
          target="_blank"
          rel="noreferrer"
        >
          View on explorer ↗
        </a>
      ) : null}
      <Button className="w-full" onClick={onDone}>
        Swap again
      </Button>
    </div>
  );
}

/**
 * The slippage tolerance, edited where it takes effect. Presets cover what
 * almost everyone wants; the custom field takes anything the policy allows
 * and explains itself when it refuses. Persisted through the background, so
 * the choice survives popup reopens and applies on both chain families.
 */
function SlippageControl({
  pct,
  onChange,
  onError,
}: {
  pct: number;
  onChange: (pct: number) => void;
  onError: (message: string) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  const apply = (value: number): void => {
    let normalized: number;
    try {
      normalized = validateSlippagePct(value);
    } catch (e) {
      onError(errorMessage(e));
      return;
    }
    setCustom("");
    void walletApi.setSwapSlippage(normalized).then(
      ({ pct: saved }) => onChange(saved),
      (e: unknown) => onError(errorMessage(e)),
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground flex items-center justify-between text-xs"
      >
        <span>Max slippage</span>
        <span className="font-semibold">
          {pct}% {open ? "\u25B4" : "\u25BE"}
        </span>
      </button>

      {open ? (
        <>
          <div className="flex items-center gap-1.5">
            {SLIPPAGE_PRESETS_PCT.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant={pct === preset ? "default" : "outline"}
                size="sm"
                className="h-7 rounded-full px-3 text-xs"
                onClick={() => apply(preset)}
              >
                {preset}%
              </Button>
            ))}
            <Input
              value={custom}
              placeholder="Custom"
              className="h-7 flex-1 text-center text-xs"
              onChange={(event) => setCustom(event.target.value.replace(",", "."))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && custom.trim()) apply(Number(custom));
              }}
              onBlur={() => {
                if (custom.trim()) apply(Number(custom));
              }}
            />
          </div>
          {pct >= HIGH_SLIPPAGE_PCT ? (
            <p className="text-muted-foreground text-[11.5px]">
              High slippage lets the price move {pct}% against you before the swap reverts — more
              room for a worse fill.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
