import React, { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { walletApi } from "../../messaging/client.js";
import { DappRequestKind, WalletState, type DappRequestView } from "../../messaging/protocol.js";
import { errorMessage } from "../format/error.js";
import { formatUnits } from "../format/units.js";
import { truncateAddress } from "../format/text.js";
import { Callout, Spinner } from "../components/primitives.js";
import { Button } from "../components/shadcn/button.js";
import { Card } from "../components/shadcn/card.js";
import { Separator } from "../components/shadcn/separator.js";
import { Unlock } from "./Unlock.js";

// Rendered in the popup window the background opens for a pending dApp request
// (popup.html#approve/<id>). Unlocks first if needed, then confirms or rejects.
export function Approval({ id }: { id: string }): React.ReactElement {
  const [locked, setLocked] = useState<boolean | null>(null);
  const [request, setRequest] = useState<DappRequestView | null>(null);
  const [missing, setMissing] = useState(false);

  const load = async (): Promise<void> => {
    const status = await walletApi.getStatus();
    if (status.state !== WalletState.Unlocked) {
      setLocked(true);
      return;
    }
    setLocked(false);
    const pending = await walletApi.dappPendingRequest(id);
    if (pending) setRequest(pending);
    else setMissing(true);
  };

  useEffect(() => {
    void load();
  }, [id]);

  if (locked === null)
    return <Centered>{<Spinner className="text-muted-foreground size-6" />}</Centered>;
  if (locked) return <Unlock onUnlocked={() => void load()} />;
  if (missing) {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-muted-foreground text-sm">
            This request has expired or was already handled.
          </p>
          <Button variant="secondary" onClick={() => window.close()}>
            Close
          </Button>
        </div>
      </Centered>
    );
  }
  if (!request) return <Centered>{<Spinner className="text-muted-foreground size-6" />}</Centered>;

  return <Confirm request={request} />;
}

function Confirm({ request }: { request: DappRequestView }): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settle = async (approved: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (approved) await walletApi.dappApproveRequest(request.id);
      else await walletApi.dappRejectRequest(request.id);
      window.close();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader request={request} />

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        <h1 className="text-center text-[17px] font-semibold">{title(request.kind)}</h1>
        {error ? <Callout>{error}</Callout> : null}
        <Details request={request} />
      </div>

      <div className="flex gap-2.5 border-t p-4">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={busy}
          onClick={() => void settle(false)}
        >
          Reject
        </Button>
        <Button className="flex-1" disabled={busy} onClick={() => void settle(true)}>
          {busy ? <Spinner /> : null}
          {actionLabel(request.kind)}
        </Button>
      </div>
    </div>
  );
}

function SiteHeader({ request }: { request: DappRequestView }): React.ReactElement {
  return (
    <header className="flex flex-col items-center gap-2 border-b px-4 py-4">
      <SiteIcon iconUrl={request.iconUrl} />
      <div className="flex flex-col items-center">
        <span className="text-sm font-semibold">{request.name}</span>
        <span className="text-muted-foreground text-[12px]">{request.origin}</span>
      </div>
    </header>
  );
}

function Details({ request }: { request: DappRequestView }): React.ReactElement {
  switch (request.kind) {
    case DappRequestKind.Connect:
      return (
        <>
          <p className="text-muted-foreground text-center text-sm">
            This site wants to see your address, account balance, and activity, and suggest
            transactions to approve.
          </p>
          <Card className="gap-0 py-0">
            <Row label="Account" value={truncateAddress(request.account)} mono />
            <Separator />
            <Row label="Network" value={request.networkName} />
          </Card>
        </>
      );
    case DappRequestKind.SwitchChain:
      return (
        <Card className="gap-0 py-0">
          <Row label="Switch to" value={request.chainName ?? "—"} />
        </Card>
      );
    case DappRequestKind.SignMessage:
    case DappRequestKind.SignTypedData:
      return (
        <>
          <Card className="gap-0 py-0">
            <Row label="Account" value={truncateAddress(request.account)} mono />
          </Card>
          <span className="text-muted-foreground text-xs font-medium">Message</span>
          <pre className="bg-muted max-h-64 overflow-auto rounded-lg border p-3 font-mono text-[12px] break-words whitespace-pre-wrap">
            {request.message}
          </pre>
        </>
      );
    case DappRequestKind.SendTransaction:
      return (
        <Card className="gap-0 py-0">
          <Row label="From" value={truncateAddress(request.account)} mono />
          <Separator />
          <Row
            label="To"
            value={request.tx?.to ? truncateAddress(request.tx.to) : "New contract"}
            mono
          />
          <Separator />
          <Row
            label="Amount"
            value={`${formatUnits(request.tx?.value ?? "0", 18)} ${nativeSymbol(request)}`}
          />
          <Separator />
          <Row label="Network" value={request.networkName} />
          {request.tx?.data && request.tx.data !== "0x" ? (
            <>
              <Separator />
              <Row label="Data" value={`${request.tx.data.slice(0, 12)}…`} mono />
            </>
          ) : null}
        </Card>
      );
    default:
      return <></>;
  }
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
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`truncate text-right font-medium ${mono ? "font-mono text-[13px]" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function SiteIcon({ iconUrl }: { iconUrl: string | null }): React.ReactElement {
  const [failed, setFailed] = useState(false);
  if (iconUrl && !failed) {
    return (
      <img
        src={iconUrl}
        alt=""
        width={40}
        height={40}
        className="bg-muted size-10 rounded-full object-cover ring-1 ring-black/5"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="bg-muted text-muted-foreground grid size-10 place-items-center rounded-full">
      <Globe className="size-5" />
    </span>
  );
}

function Centered({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="flex flex-1 items-center justify-center p-6">{children}</div>;
}

function nativeSymbol(request: DappRequestView): string {
  // EVM chains are ETH-denominated by default; custom chains still show a value.
  return request.networkName.toLowerCase().includes("bnb") ? "BNB" : "ETH";
}

function title(kind: DappRequestKind): string {
  switch (kind) {
    case DappRequestKind.Connect:
      return "Connect";
    case DappRequestKind.SignMessage:
    case DappRequestKind.SignTypedData:
      return "Signature request";
    case DappRequestKind.SendTransaction:
      return "Confirm transaction";
    case DappRequestKind.SwitchChain:
      return "Switch network";
    default:
      return "Request";
  }
}

function actionLabel(kind: DappRequestKind): string {
  switch (kind) {
    case DappRequestKind.Connect:
      return "Connect";
    case DappRequestKind.SendTransaction:
      return "Confirm";
    case DappRequestKind.SwitchChain:
      return "Switch";
    default:
      return "Sign";
  }
}
