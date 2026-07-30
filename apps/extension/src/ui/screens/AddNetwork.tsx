import React, { useState } from "react";
import { walletApi } from "../../messaging/client.js";
import type { NetworkView } from "../../messaging/protocol.js";
import { errorMessage } from "../format/error.js";
import { Callout, Field, Screen, Spinner } from "../components/primitives.js";
import { Button } from "../components/shadcn/button.js";

// Imports a custom EVM network from name/RPC/chain id/symbol (+ optional explorer).
export function AddNetwork({
  onBack,
  onAdded,
}: {
  onBack: () => void;
  onAdded: (networks: readonly NetworkView[]) => void;
}): React.ReactElement {
  const [name, setName] = useState("");
  const [rpcUrl, setRpcUrl] = useState("");
  const [chainId, setChainId] = useState("");
  const [symbol, setSymbol] = useState("");
  const [explorerUrl, setExplorerUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    const id = Number(chainId);
    if (!name.trim()) return setError("Enter a network name.");
    if (!/^https?:\/\//.test(rpcUrl.trim())) return setError("Enter a valid RPC URL.");
    if (!Number.isInteger(id) || id <= 0) return setError("Enter a valid numeric chain ID.");
    if (!symbol.trim()) return setError("Enter a currency symbol.");

    setBusy(true);
    try {
      const networks = await walletApi.addNetwork({
        name: name.trim(),
        rpcUrl: rpcUrl.trim(),
        chainId: id,
        symbol: symbol.trim(),
        ...(explorerUrl.trim() ? { explorerUrl: explorerUrl.trim() } : {}),
      });
      onAdded(networks);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Add network" onBack={onBack}>
      {error ? <Callout>{error}</Callout> : null}
      <Field label="Network name" value={name} onChange={setName} placeholder="My EVM chain" />
      <Field
        label="RPC URL"
        value={rpcUrl}
        onChange={setRpcUrl}
        placeholder="https://rpc.example.com"
      />
      <Field label="Chain ID" value={chainId} onChange={setChainId} placeholder="1" />
      <Field label="Currency symbol" value={symbol} onChange={setSymbol} placeholder="ETH" />
      <Field
        label="Block explorer URL (optional)"
        value={explorerUrl}
        onChange={setExplorerUrl}
        placeholder="https://explorer.example.com"
      />
      <Button className="w-full" disabled={busy} onClick={() => void submit()}>
        {busy ? <Spinner /> : null}
        Add network
      </Button>
    </Screen>
  );
}
