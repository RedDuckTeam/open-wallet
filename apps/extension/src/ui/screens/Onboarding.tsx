import React, { useState } from "react";
import { Copy, Wallet } from "lucide-react";
import { toast } from "sonner";
import { walletApi } from "../../messaging/client.js";
import { errorMessage } from "../format/error.js";
import { Callout, Field, MnemonicGrid, Screen, Spinner } from "../components/primitives.js";
import { Button } from "../components/shadcn/button.js";
import { Checkbox } from "../components/shadcn/checkbox.js";
import { Label } from "../components/shadcn/label.js";

type Mode = "choose" | "create" | "import";

function BrandMark({ title, subtitle }: { title: string; subtitle: string }): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <div className="bg-primary text-primary-foreground shadow-primary/25 mb-2 grid size-14 place-items-center rounded-2xl shadow-lg">
        <Wallet className="size-7" />
      </div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-muted-foreground text-sm">{subtitle}</p>
    </div>
  );
}

export function Onboarding({ onDone }: { onDone: () => void }): React.ReactElement {
  const [mode, setMode] = useState<Mode>("choose");

  if (mode === "create") return <CreateFlow onBack={() => setMode("choose")} onDone={onDone} />;
  if (mode === "import") return <ImportFlow onBack={() => setMode("choose")} onDone={onDone} />;

  return (
    <div className="flex flex-1 flex-col justify-center gap-9 px-5">
      <BrandMark title="OpenWallet" subtitle="A non-custodial multi-chain wallet." />
      <div className="flex flex-col gap-3">
        <Button className="w-full" onClick={() => setMode("create")}>
          Create a new wallet
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => setMode("import")}>
          Import an existing wallet
        </Button>
      </div>
    </div>
  );
}

function usePasswordPair(): {
  password: string;
  setPassword: (v: string) => void;
  confirm: string;
  setConfirm: (v: string) => void;
  validate: () => string | null;
} {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const validate = (): string | null => {
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirm) return "Passwords don't match.";
    return null;
  };
  return { password, setPassword, confirm, setConfirm, validate };
}

function CreateFlow({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: () => void;
}): React.ReactElement {
  const pw = usePasswordPair();
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (): Promise<void> => {
    const invalid = pw.validate();
    if (invalid) return setError(invalid);
    setError(null);
    setBusy(true);
    try {
      const { mnemonic: phrase } = await walletApi.createWallet(pw.password);
      setMnemonic(phrase);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (mnemonic) {
    return (
      <Screen title="Back up your phrase">
        <Callout tone="info">
          Write these 12 words down in order and keep them offline. Anyone with them controls this
          wallet, and it can never be recovered without them.
        </Callout>
        <MnemonicGrid mnemonic={mnemonic} />
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            void navigator.clipboard.writeText(mnemonic);
            toast.success("Recovery phrase copied");
          }}
        >
          <Copy />
          Copy to clipboard
        </Button>
        <Label className="text-muted-foreground cursor-pointer justify-center font-normal">
          <Checkbox checked={saved} onCheckedChange={(v) => setSaved(v === true)} />
          I&apos;ve saved my recovery phrase
        </Label>
        <Button className="w-full" disabled={!saved} onClick={onDone}>
          Open my wallet
        </Button>
      </Screen>
    );
  }

  return (
    <Screen title="Create a wallet" onBack={onBack}>
      {error ? <Callout>{error}</Callout> : null}
      <Field
        label="Password"
        type="password"
        value={pw.password}
        onChange={pw.setPassword}
        autoFocus
        hint="Unlocks this wallet on this device. Minimum 8 characters."
      />
      <Field label="Confirm password" type="password" value={pw.confirm} onChange={pw.setConfirm} />
      <Button className="w-full" disabled={busy} onClick={() => void create()}>
        {busy ? <Spinner /> : null}
        Continue
      </Button>
    </Screen>
  );
}

function ImportFlow({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: () => void;
}): React.ReactElement {
  const [mnemonic, setMnemonic] = useState("");
  const pw = usePasswordPair();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    const invalid = pw.validate();
    if (invalid) return setError(invalid);
    setError(null);
    setBusy(true);
    try {
      await walletApi.importWallet(mnemonic.trim().replace(/\s+/g, " "), pw.password);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Import a wallet" onBack={onBack}>
      {error ? <Callout>{error}</Callout> : null}
      <Field
        label="Recovery phrase"
        value={mnemonic}
        onChange={setMnemonic}
        multiline
        placeholder="Enter your 12 or 24 word phrase"
        autoFocus
      />
      <Field label="New password" type="password" value={pw.password} onChange={pw.setPassword} />
      <Field label="Confirm password" type="password" value={pw.confirm} onChange={pw.setConfirm} />
      <Button className="w-full" disabled={busy} onClick={() => void submit()}>
        {busy ? <Spinner /> : null}
        Import
      </Button>
    </Screen>
  );
}
