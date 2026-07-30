import React, { useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { walletApi } from "../../messaging/client.js";
import { AccountType, type AccountView } from "../../messaging/protocol.js";
import { errorMessage } from "../format/error.js";
import { truncateAddress } from "../format/text.js";
import { usePersistentToggle } from "../hooks/usePersistentToggle.js";
import { Avatar, Callout, Field, Screen, Spinner } from "../components/primitives.js";
import { Badge } from "../components/shadcn/badge.js";
import { Button } from "../components/shadcn/button.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../components/shadcn/collapsible.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/shadcn/dropdown-menu.js";

type Sub = { view: "list" } | { view: "import" } | { view: "remove"; account: AccountView };

export function Accounts({
  accounts: initial,
  activeId: initialActiveId,
  onBack,
  onDone,
}: {
  accounts: readonly AccountView[];
  activeId: string;
  onBack: () => void;
  onDone: () => void;
}): React.ReactElement {
  const [accounts, setAccounts] = useState<readonly AccountView[]>(initial);
  const [activeId, setActiveId] = useState(initialActiveId);
  const [sub, setSub] = useState<Sub>({ view: "list" });
  const [hiddenOpen, setHiddenOpen] = usePersistentToggle("accounts.hidden");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const backToList = (): void => {
    setError(null);
    setSub({ view: "list" });
  };

  if (sub.view === "import") {
    return <ImportAccount onBack={backToList} onDone={onDone} />;
  }
  if (sub.view === "remove") {
    return <RemoveAccount account={sub.account} onBack={backToList} onDone={onDone} />;
  }

  const visible = accounts.filter((account) => !account.hidden);
  const hidden = accounts.filter((account) => account.hidden);

  const select = (id: string): void => {
    void walletApi.selectAccount(id).then(onDone);
  };
  const hide = (id: string): void => {
    void walletApi.hideAccount(id).then(setAccounts);
  };
  const unhide = (id: string): void => {
    void walletApi.unhideAccount(id).then(setAccounts);
  };

  // Reveal the next HD account but stay in the switcher. Leaving (onBack) reloads.
  const add = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const account = await walletApi.addAccount();
      setAccounts((current) => [...current, account]);
      setActiveId(account.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Accounts" onBack={onBack}>
      {error ? <Callout>{error}</Callout> : null}

      <div className="flex flex-col gap-1.5">
        {visible.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            active={account.id === activeId}
            onSelect={() => select(account.id)}
            onHide={account.type === AccountType.Hd ? () => hide(account.id) : undefined}
            onRemove={
              account.type === AccountType.Imported
                ? () => setSub({ view: "remove", account })
                : undefined
            }
          />
        ))}
      </div>

      {hidden.length > 0 ? (
        <Collapsible
          open={hiddenOpen}
          onOpenChange={setHiddenOpen}
          className="flex flex-col gap-1.5"
        >
          <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-semibold">
            <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
            {hidden.length} hidden
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-1.5">
            {hidden.map((account) => (
              <div
                key={account.id}
                className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-2.5"
              >
                <Avatar seed={account.address} size={30} />
                <span className="flex flex-col leading-tight">
                  <span className="text-muted-foreground text-sm font-semibold">
                    {account.name}
                  </span>
                  <span className="text-muted-foreground font-mono text-[12px]">
                    {truncateAddress(account.address)}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => unhide(account.id)}
                >
                  <Eye />
                  Show
                </Button>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      <div className="flex flex-col gap-2.5">
        <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void add()}>
          {busy ? <Spinner /> : <Plus />}
          Add account
        </Button>
        <Button variant="outline" className="w-full" onClick={() => setSub({ view: "import" })}>
          <KeyRound />
          Import private key
        </Button>
      </div>
    </Screen>
  );
}

function AccountRow({
  account,
  active,
  onSelect,
  onHide,
  onRemove,
}: {
  account: AccountView;
  active: boolean;
  onSelect: () => void;
  onHide?: () => void;
  onRemove?: () => void;
}): React.ReactElement {
  // The active account can't be hidden; there must always be a visible one.
  const hideAction = active ? undefined : onHide;
  const hasMenu = Boolean(hideAction ?? onRemove);

  const copyAddress = (): void => {
    void navigator.clipboard.writeText(account.address);
    toast.success("Address copied");
  };

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${active ? "border-primary bg-primary/5" : ""}`}
    >
      <button onClick={onSelect} aria-label={`Select ${account.name}`}>
        <Avatar seed={account.address} size={30} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col items-start leading-tight">
        <button
          className="flex items-center gap-1.5 text-sm font-semibold"
          onClick={onSelect}
          aria-label={`Select ${account.name}`}
        >
          {account.name}
          {account.type === AccountType.Imported ? (
            <Badge variant="secondary" className="text-[10px]">
              Imported
            </Badge>
          ) : null}
        </button>
        {/* Address doubles as a copy button. */}
        <button
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 font-mono text-[12px]"
          onClick={copyAddress}
          title="Copy address"
        >
          {truncateAddress(account.address)}
          <Copy className="size-3" />
        </button>
      </div>
      {active ? <Check className="text-primary size-4" /> : null}
      {hasMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground -mr-1 size-8"
              aria-label={`${account.name} options`}
            >
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {hideAction ? (
              <DropdownMenuItem onClick={hideAction}>
                <EyeOff />
                Hide account
              </DropdownMenuItem>
            ) : null}
            {onRemove ? (
              <DropdownMenuItem variant="destructive" onClick={onRemove}>
                <Trash2 />
                Remove account
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function ImportAccount({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: () => void;
}): React.ReactElement {
  const [privateKey, setPrivateKey] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    if (!privateKey.trim()) return setError("Enter a private key.");
    if (!password) return setError("Enter your password to confirm.");
    setBusy(true);
    try {
      await walletApi.importAccount(privateKey.trim(), password);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Import private key" onBack={onBack}>
      {error ? <Callout>{error}</Callout> : null}
      <Callout tone="info">
        The key is imported for the current network&apos;s chain and stored encrypted. Imported
        accounts aren&apos;t covered by your recovery phrase, so keep the key safe.
      </Callout>
      <Field
        label="Private key"
        value={privateKey}
        onChange={setPrivateKey}
        placeholder="Hex private key"
        autoFocus
      />
      <Field
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        hint="Confirms it's you; the vault is re-encrypted with this."
      />
      <Button className="w-full" disabled={busy} onClick={() => void submit()}>
        {busy ? <Spinner /> : null}
        Import
      </Button>
    </Screen>
  );
}

function RemoveAccount({
  account,
  onBack,
  onDone,
}: {
  account: AccountView;
  onBack: () => void;
  onDone: () => void;
}): React.ReactElement {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    if (!password) return setError("Enter your password to confirm.");
    setBusy(true);
    try {
      await walletApi.removeAccount(account.id, password);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Remove account" onBack={onBack}>
      {error ? <Callout>{error}</Callout> : null}
      <Callout>
        Removing <span className="font-semibold">{account.name}</span> (
        {truncateAddress(account.address)}) deletes its key from this wallet. It can only be
        restored by importing the private key again.
      </Callout>
      <Field label="Password" type="password" value={password} onChange={setPassword} autoFocus />
      <Button
        variant="destructive"
        className="w-full"
        disabled={busy}
        onClick={() => void submit()}
      >
        {busy ? <Spinner /> : null}
        Remove account
      </Button>
    </Screen>
  );
}
