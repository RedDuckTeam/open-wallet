import React, { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { walletApi } from "../../messaging/client.js";
import {
  NATIVE_ASSET_ID,
  type AssetView,
  type NetworkView,
  type SendResult,
} from "../../messaging/protocol.js";
import { errorMessage } from "../format/error.js";
import { truncateAddress } from "../format/text.js";
import { toBaseUnits } from "../../units.js";
import { useAssets } from "../state/assets.js";
import { AmountPanel, TokenPill, maxAmount, useFeeReserve } from "../components/amount.js";
import { Callout, Field, NetworkDot, Screen, Spinner } from "../components/primitives.js";
import { Button } from "../components/shadcn/button.js";
import { Card } from "../components/shadcn/card.js";
import { Separator } from "../components/shadcn/separator.js";
import { Skeleton } from "../components/shadcn/skeleton.js";

interface Draft {
  readonly asset: AssetView;
  readonly to: string;
  readonly amount: string;
}

export function Send({
  network,
  onBack,
  onSent,
}: {
  network: NetworkView;
  onBack: () => void;
  onSent: () => void;
}): React.ReactElement {
  const { assets, error: assetsError, reload } = useAssets();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  if (result) return <Sent result={result} onDone={onSent} />;
  if (draft) {
    return (
      <Review
        network={network}
        draft={draft}
        onBack={() => setDraft(null)}
        onSent={(sent) => {
          setResult(sent);
          reload();
        }}
      />
    );
  }
  return (
    <SendForm
      network={network}
      assets={assets}
      assetsError={assetsError}
      onBack={onBack}
      onReview={setDraft}
    />
  );
}

function SendForm({
  network,
  assets,
  assetsError,
  onBack,
  onReview,
}: {
  network: NetworkView;
  assets: readonly AssetView[] | null;
  assetsError: string | null;
  onBack: () => void;
  onReview: (draft: Draft) => void;
}): React.ReactElement {
  const [assetId, setAssetId] = useState(NATIVE_ASSET_ID);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reserveWei = useFeeReserve(network.id, "transfer");

  const selected = assets?.find((a) => a.id === assetId) ?? assets?.[0];

  const review = async (): Promise<void> => {
    setError(null);
    if (!selected) return;
    if (!(Number(amount) > 0)) return setError("Enter an amount greater than 0.");
    // Exact bigint comparison, not a float one — the same base-unit conversion
    // the actual send uses (background/handlers.ts), so this can't disagree
    // with it at a precision boundary the way a lossy Number() comparison could.
    if (toBaseUnits(amount, selected.decimals) > BigInt(selected.balanceWei)) {
      return setError("Amount exceeds your balance.");
    }
    setBusy(true);
    try {
      const { address } = await walletApi.resolveRecipient(recipient.trim());
      if (!address) return setError("Enter a valid address or ENS name.");
      onReview({ asset: selected, to: address, amount });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Send" onBack={onBack}>
      {(error ?? assetsError) ? <Callout>{error ?? assetsError}</Callout> : null}

      {assets === null ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : (
        <AmountPanel
          label="Amount"
          asset={selected}
          amount={amount}
          onAmountChange={setAmount}
          onMax={selected ? () => setAmount(maxAmount(selected, reserveWei)) : undefined}
          pill={<TokenPill asset={selected} assets={assets} onSelect={setAssetId} />}
        />
      )}

      <Field
        label="Recipient"
        value={recipient}
        onChange={setRecipient}
        placeholder="0x… or name.eth"
      />
      <Button className="w-full" disabled={busy} onClick={() => void review()}>
        {busy ? <Spinner /> : null}
        Review
      </Button>
    </Screen>
  );
}

function Review({
  network,
  draft,
  onBack,
  onSent,
}: {
  network: NetworkView;
  draft: Draft;
  onBack: () => void;
  onSent: (result: SendResult) => void;
}): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      onSent(await walletApi.send(draft.asset.id, draft.to, draft.amount));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Review" onBack={onBack}>
      {error ? <Callout>{error}</Callout> : null}

      <div className="flex flex-col items-center gap-1 py-3">
        <span className="text-[32px] font-bold tabular-nums">
          {draft.amount} {draft.asset.symbol}
        </span>
      </div>

      <Card className="gap-0 py-0">
        <Row label="Asset" value={draft.asset.name} />
        <Separator />
        <Row label="To" value={truncateAddress(draft.to)} mono />
        <Separator />
        <Row
          label="Network"
          value={
            <span className="flex items-center gap-1.5">
              <NetworkDot color={network.color} />
              {network.name}
            </span>
          }
        />
      </Card>

      <Button className="w-full" disabled={busy} onClick={() => void confirm()}>
        {busy ? <Spinner /> : null}
        Confirm &amp; send
      </Button>
    </Screen>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${mono ? "font-mono text-[13px]" : ""}`}>{value}</span>
    </div>
  );
}

function Sent({ result, onDone }: { result: SendResult; onDone: () => void }): React.ReactElement {
  return (
    <Screen title="Sent">
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CheckCircle2 className="text-success size-12" />
        <p className="text-muted-foreground text-sm">
          Your transaction was broadcast. It may take a minute to confirm.
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
        Done
      </Button>
    </Screen>
  );
}
