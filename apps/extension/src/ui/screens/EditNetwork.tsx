import React, { useState } from "react";
import { walletApi } from "../../messaging/client.js";
import type { NetworkView } from "../../messaging/protocol.js";
import { CHAIN_KINDS } from "../../chain-kinds.js";
import { errorMessage } from "../format/error.js";
import { Callout, Field, NetworkDot, Screen, Spinner } from "../components/primitives.js";
import { Badge } from "../components/shadcn/badge.js";
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

// Per-network settings: override the RPC endpoint, and remove custom networks.
export function EditNetwork({
  network,
  onBack,
  onChanged,
}: {
  network: NetworkView;
  onBack: () => void;
  onChanged: (networks: readonly NetworkView[]) => void;
}): React.ReactElement {
  const [rpcUrl, setRpcUrl] = useState(network.rpcUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<readonly NetworkView[]>): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      onChanged(await action());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const saveRpc = (): void => {
    if (!/^https?:\/\//.test(rpcUrl.trim())) {
      setError("Enter a valid RPC URL.");
      return;
    }
    void run(() => walletApi.setNetworkRpc(network.id, rpcUrl.trim()));
  };

  return (
    <Screen title={network.name} onBack={onBack}>
      {error ? <Callout>{error}</Callout> : null}

      <div className="flex items-center gap-2">
        <NetworkDot color={network.color} size={12} />
        <span className="text-sm font-semibold">{network.name}</span>
        <span className="text-muted-foreground text-[12px]">{network.symbol}</span>
        {network.isTestnet ? (
          <Badge variant="secondary" className="text-[10px]">
            Testnet
          </Badge>
        ) : null}
      </div>

      <Field
        label={CHAIN_KINDS[network.kind].endpointLabel}
        value={rpcUrl}
        onChange={setRpcUrl}
        placeholder="https://rpc.example.com"
        hint={network.hasCustomRpc ? "Using a custom endpoint." : "Using the built-in default."}
      />
      <Button className="w-full" disabled={busy} onClick={saveRpc}>
        {busy ? <Spinner /> : null}
        Save endpoint
      </Button>
      {network.hasCustomRpc ? (
        <Button
          variant="ghost"
          className="w-full"
          disabled={busy}
          onClick={() => void run(() => walletApi.resetNetworkRpc(network.id))}
        >
          Reset to default
        </Button>
      ) : null}

      {network.isCustom ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full" disabled={busy}>
              Remove network
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {network.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the network and its custom RPC from this wallet. You can add it again
                later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={() => void run(() => walletApi.removeNetwork(network.id))}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </Screen>
  );
}
