import React, { useState } from "react";
import { Eye, Lock, Moon, Sun } from "lucide-react";
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
  onBack,
  onLocked,
  onReset,
}: {
  onBack: () => void;
  onLocked: () => void;
  onReset: () => void;
}): React.ReactElement {
  return (
    <Screen title="Settings" onBack={onBack}>
      <Appearance />
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
