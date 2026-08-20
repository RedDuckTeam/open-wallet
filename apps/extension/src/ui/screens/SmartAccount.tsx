import React, { useCallback, useEffect, useState } from "react";
import { Sparkles, Zap } from "lucide-react";
import { walletApi } from "../../messaging/client.js";
import type { NetworkView, SmartAccountView } from "../../messaging/protocol.js";
import { errorMessage } from "../format/error.js";
import { formatUnits } from "../format/units.js";
import { truncateAddress } from "../format/text.js";
import { Callout, Field, Screen, Spinner } from "../components/primitives.js";
import { Button } from "../components/shadcn/button.js";
import { Badge } from "../components/shadcn/badge.js";
import { Separator } from "../components/shadcn/separator.js";

// The three states a user can actually be in, derived from the view rather
// than tracked separately: no bundler at all, an account that already batches,
// or one that can be upgraded on the next send.
type Stage = "unavailable" | "upgradable" | "active" | "foreign";

function stageOf(smart: SmartAccountView): Stage {
  if (smart.delegatedElsewhere) return "foreign";
  if (!smart.supported) return "unavailable";
  return smart.active ? "active" : "upgradable";
}

export function SmartAccount({
  network,
  onBack,
}: {
  network: NetworkView;
  onBack: () => void;
}): React.ReactElement {
  const [smart, setSmart] = useState<SmartAccountView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setSmart(await walletApi.getSmartAccount());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!smart) {
    return (
      <Screen title="Smart account" onBack={onBack}>
        {error ? <Callout>{error}</Callout> : <Spinner />}
      </Screen>
    );
  }

  return (
    <Screen title="Smart account" onBack={onBack}>
      {error ? <Callout>{error}</Callout> : null}
      <Status smart={smart} network={network} />
      <Upgrade smart={smart} network={network} onChanged={() => void load()} />
      <Kinds smart={smart} onChanged={setSmart} />
      <Separator />
      <Endpoints smart={smart} network={network} onChanged={setSmart} />
    </Screen>
  );
}

function Status({
  smart,
  network,
}: {
  smart: SmartAccountView;
  network: NetworkView;
}): React.ReactElement {
  const stage = stageOf(smart);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4" />
          {network.name}
        </span>
        <Badge variant={stage === "active" ? "default" : "secondary"}>
          {stage === "active"
            ? "Active"
            : stage === "upgradable"
              ? "Not upgraded"
              : stage === "foreign"
                ? "Other wallet"
                : "Unavailable"}
        </Badge>
      </div>

      {stage === "active" || stage === "upgradable" ? (
        <dl className="text-muted-foreground flex flex-col gap-1 text-[12.5px]">
          <Row label="Address" value={truncateAddress(smart.address)} />
          {/* Spelled out because it's the property that decides whether the
              user has one balance or two — the single most confusing part of
              account abstraction for someone switching wallets. */}
          <Row
            label="Model"
            value={smart.sharesOwnerAddress ? "EIP-7702 (same address)" : "Separate address"}
          />
          <Row label="EntryPoint" value={`v${smart.entryPointVersion}`} />
        </dl>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt>{label}</dt>
      <dd className="text-foreground font-mono">{value}</dd>
    </div>
  );
}

function Upgrade({
  smart,
  network,
  onChanged,
}: {
  smart: SmartAccountView;
  network: NetworkView;
  onChanged: () => void;
}): React.ReactElement | null {
  const [quote, setQuote] = useState<{ id: string; maxCostWei: string; sponsored: boolean } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const stage = stageOf(smart);

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (stage === "unavailable") {
    return (
      <Callout tone="info">
        No ERC-4337 bundler is configured for {network.name}. Add one below to enable batched,
        atomic transactions.
      </Callout>
    );
  }

  if (stage === "foreign") {
    return (
      <Callout>
        This account is already delegated to another wallet&apos;s smart-account contract.
        OpenWallet won&apos;t overwrite it. Revert it in that wallet first.
      </Callout>
    );
  }

  if (stage === "active") {
    return (
      <div className="flex flex-col gap-2.5">
        {error ? <Callout>{error}</Callout> : null}
        <Callout tone="success">
          This account executes batched calls atomically. Sends and swaps go out as User Operations,
          and dApps see it through EIP-5792.
        </Callout>
        {smart.sharesOwnerAddress ? (
          <Button
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await walletApi.revertSmartAccount();
                onChanged();
              })
            }
          >
            {busy ? <Spinner /> : null}
            Revert to a regular account
          </Button>
        ) : null}
      </div>
    );
  }

  if (done) {
    return <Callout tone="success">Upgraded. Transaction {truncateAddress(done)}.</Callout>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {error ? <Callout>{error}</Callout> : null}
      {quote ? (
        <>
          <Callout tone="info">
            {quote.sponsored
              ? "Sponsored by a paymaster — this costs you nothing."
              : `Costs up to ${formatUnits(quote.maxCostWei, network.decimals)} ${network.symbol}.`}
            {smart.sharesOwnerAddress
              ? " Your address and balance stay exactly the same."
              : " Funds must be moved to the new address separately."}
          </Callout>
          <Button
            className="w-full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const { userOpHash } = await walletApi.sendPreparedCalls(quote.id);
                const receipt = await walletApi.awaitCalls(userOpHash);
                if (!receipt.success) throw new Error("The upgrade operation reverted");
                setDone(receipt.transactionHash);
                onChanged();
              })
            }
          >
            {busy ? <Spinner /> : null}
            Confirm upgrade
          </Button>
          <Button variant="ghost" className="w-full" disabled={busy} onClick={() => setQuote(null)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button
          className="w-full"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              setQuote(await walletApi.prepareSmartAccountUpgrade());
            })
          }
        >
          {busy ? <Spinner /> : <Zap />}
          Upgrade to smart account
        </Button>
      )}
    </div>
  );
}

/**
 * Which account implementation to use.
 *
 * Only offered before the account is upgraded: the choice determines the
 * account's *address* for counterfactual kinds, so changing it afterwards
 * would silently point the wallet at a different account than the one holding
 * the user's funds.
 */
function Kinds({
  smart,
  onChanged,
}: {
  smart: SmartAccountView;
  onChanged: (next: SmartAccountView) => void;
}): React.ReactElement | null {
  const [kinds, setKinds] = useState<
    readonly {
      id: string;
      label: string;
      sharesOwnerAddress: boolean;
      available: boolean;
      note: string;
    }[]
  >([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void walletApi
      .smartAccountKinds()
      .then(setKinds)
      .catch(() => undefined);
  }, []);

  if (!smart.supported || smart.active || kinds.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        Implementation
      </span>
      {kinds.map((kind) => (
        <Button
          key={kind.id}
          variant={kind.id === smart.kind ? "default" : "outline"}
          className="w-full justify-between"
          disabled={busy || !kind.available}
          onClick={() => {
            setBusy(true);
            void walletApi
              .setSmartAccountKind(kind.id)
              .then(onChanged)
              .finally(() => setBusy(false));
          }}
        >
          <span>{kind.label}</span>
          <span className="text-[11px] opacity-70">{kind.note}</span>
        </Button>
      ))}
    </div>
  );
}

/**
 * Bundler and paymaster endpoints. These normally carry a provider API key,
 * which is why they're editable here at all: a shipped build can't know the
 * user's key, and requiring a rebuild to set one would make smart accounts
 * unusable for anyone who didn't compile the extension themselves.
 */
function Endpoints({
  smart,
  network,
  onChanged,
}: {
  smart: SmartAccountView;
  network: NetworkView;
  onChanged: (next: SmartAccountView) => void;
}): React.ReactElement {
  const [bundler, setBundler] = useState(smart.bundlerUrl);
  const [paymaster, setPaymaster] = useState(smart.paymasterUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = (action: () => Promise<SmartAccountView>): void => {
    setBusy(true);
    setError(null);
    void action()
      .then((next) => {
        onChanged(next);
        setBundler(next.bundlerUrl);
        setPaymaster(next.paymasterUrl);
      })
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="flex flex-col gap-3">
      {error ? <Callout>{error}</Callout> : null}
      <Field
        label="Bundler URL"
        value={bundler}
        onChange={setBundler}
        hint="Where User Operations are submitted. Required for smart accounts; the URL usually includes your provider API key."
      />
      <Field
        label="Paymaster URL (optional)"
        value={paymaster}
        onChange={setPaymaster}
        hint="ERC-7677 sponsorship. Leave empty to pay your own gas."
      />
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={busy}
          onClick={() =>
            apply(async () => {
              await walletApi.setNetworkBundler(network.id, bundler.trim());
              return walletApi.setNetworkPaymaster(network.id, paymaster.trim());
            })
          }
        >
          {busy ? <Spinner /> : null}
          Save
        </Button>
        {smart.hasCustomBundler || smart.hasCustomPaymaster ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              apply(async () => {
                await walletApi.resetNetworkBundler(network.id);
                return walletApi.resetNetworkPaymaster(network.id);
              })
            }
          >
            Reset
          </Button>
        ) : null}
      </div>
    </div>
  );
}
