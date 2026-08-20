import React, { useState } from "react";
import { Eye, FlaskConical, Lock, Moon, Sparkles, Sun } from "lucide-react";
import { walletApi } from "../../messaging/client.js";
import { errorMessage } from "../format/error.js";
import { useTheme } from "../hooks/useTheme.js";
import { Callout, Field, MnemonicGrid, Screen, Spinner } from "../components/primitives.js";
import { Button } from "../components/shadcn/button.js";
import { Label } from "../components/shadcn/label.js";
import { Separator } from "../components/shadcn/separator.js";
import { Switch } from "../components/shadcn/switch.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/shadcn/alert-dialog.js";

export function Settings({
  testnetMode,
  onBack,
  onLocked,
  onReset,
  onNav,
  onModeChanged,
}: {
  testnetMode: boolean;
  onBack: () => void;
  onLocked: () => void;
  onReset: () => void;
  onNav: (view: "smartAccount") => void;
  onModeChanged: () => void;
}): React.ReactElement {
  return (
    <Screen title="Settings" onBack={onBack}>
      <Appearance />
      <TestnetMode enabled={testnetMode} onChanged={onModeChanged} />
      <Separator />
      <Button variant="outline" className="w-full" onClick={() => onNav("smartAccount")}>
        <Sparkles />
        Smart account
      </Button>
      <Separator />
      <RevealPhrase />
      <Separator />
      <div className="flex flex-col gap-2.5">
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            void walletApi.lock().then(onLocked);
          }}
        >
          <Lock />
          Lock wallet
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full">
              Reset wallet
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset this wallet?</AlertDialogTitle>
              <AlertDialogDescription>
                This erases the wallet from this device. You can only restore it with your recovery
                phrase.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={() => {
                  void walletApi.reset().then(onReset);
                }}
              >
                Erase wallet
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Screen>
  );
}

function Appearance(): React.ReactElement {
  const { theme, setTheme } = useTheme();
  const dark = theme === "dark";

  return (
    <Label
      htmlFor="dark-mode"
      className="flex cursor-pointer items-center justify-between font-normal"
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
        Dark mode
      </span>
      <Switch
        id="dark-mode"
        checked={dark}
        onCheckedChange={(on) => setTheme(on ? "dark" : "light")}
      />
    </Label>
  );
}

/**
 * Testnet mode narrows the wallet to test networks only: mainnets disappear
 * from the network list and the swap tab goes away (aggregators don't route
 * testnets). If the active network gets hidden by the flip, the wallet layer
 * moves activation to the mode's default chain — hence `onChanged`, which
 * re-reads the status.
 */
function TestnetMode({
  enabled,
  onChanged,
}: {
  enabled: boolean;
  onChanged: () => void;
}): React.ReactElement {
  const [busy, setBusy] = useState(false);

  const toggle = async (on: boolean): Promise<void> => {
    setBusy(true);
    try {
      await walletApi.setTestnetMode(on);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Label
      htmlFor="testnet-mode"
      className="flex cursor-pointer items-center justify-between font-normal"
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <FlaskConical className="size-4" />
        Testnet mode
      </span>
      <Switch
        id="testnet-mode"
        checked={enabled}
        disabled={busy}
        onCheckedChange={(on) => void toggle(on)}
      />
    </Label>
  );
}

function RevealPhrase(): React.ReactElement {
  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reveal = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { mnemonic } = await walletApi.revealMnemonic(password);
      setPhrase(mnemonic);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const hide = (): void => {
    setPhrase(null);
    setOpen(false);
    setPassword("");
  };

  if (!open) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <Eye />
        Reveal recovery phrase
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {phrase ? (
        <>
          <Callout tone="info">Never share this. Anyone with it controls your wallet.</Callout>
          <MnemonicGrid mnemonic={phrase} />
          <Button variant="ghost" className="w-full" onClick={hide}>
            Hide
          </Button>
        </>
      ) : (
        <>
          {error ? <Callout>{error}</Callout> : null}
          <Field
            label="Confirm password to reveal"
            type="password"
            value={password}
            onChange={setPassword}
            autoFocus
          />
          <Button className="w-full" disabled={busy} onClick={() => void reveal()}>
            {busy ? <Spinner /> : null}
            Reveal
          </Button>
        </>
      )}
    </div>
  );
}
