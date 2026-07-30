import React, { useState } from "react";
import { Wallet } from "lucide-react";
import { walletApi } from "../../messaging/client.js";
import { errorMessage } from "../format/error.js";
import { Callout, Field, Spinner } from "../components/primitives.js";
import { Button } from "../components/shadcn/button.js";
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

export function Unlock({ onUnlocked }: { onUnlocked: () => void }): React.ReactElement {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await walletApi.unlock(password);
      onUnlocked();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = async (): Promise<void> => {
    await walletApi.reset();
    onUnlocked();
  };

  return (
    <div className="flex flex-1 flex-col justify-center gap-8 px-5">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <div className="bg-primary text-primary-foreground shadow-primary/25 mb-2 grid size-14 place-items-center rounded-2xl shadow-lg">
          <Wallet className="size-7" />
        </div>
        <h1 className="text-xl font-semibold">Welcome back</h1>
        <p className="text-muted-foreground text-sm">Enter your password to unlock.</p>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void unlock();
        }}
      >
        {error ? <Callout>{error}</Callout> : null}
        <Field label="Password" type="password" value={password} onChange={setPassword} autoFocus />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Spinner /> : null}
          Unlock
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="link" className="text-muted-foreground mx-auto">
              Forgot password? Reset wallet
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset this wallet?</AlertDialogTitle>
              <AlertDialogDescription>
                Resetting erases this wallet from the device. You can only restore it with your
                recovery phrase.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={() => void reset()}
              >
                Erase and start over
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </form>
    </div>
  );
}
