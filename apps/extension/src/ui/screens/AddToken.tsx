import React, { useState } from "react";
import { walletApi } from "../../messaging/client.js";
import { errorMessage } from "../format/error.js";
import { Callout, Field, Screen, Spinner } from "../components/primitives.js";
import { Button } from "../components/shadcn/button.js";

export function AddToken({
  onBack,
  onAdded,
}: {
  onBack: () => void;
  onAdded: () => void;
}): React.ReactElement {
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await walletApi.addToken(address.trim());
      onAdded();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Add token" onBack={onBack}>
      {error ? <Callout>{error}</Callout> : null}
      <Callout tone="info">
        Paste an ERC-20 contract address on the current network. Its name, symbol, and decimals are
        read from the contract.
      </Callout>
      <Field
        label="Token contract address"
        value={address}
        onChange={setAddress}
        placeholder="0x…"
        autoFocus
      />
      <Button className="w-full" disabled={busy} onClick={() => void submit()}>
        {busy ? <Spinner /> : null}
        Add token
      </Button>
    </Screen>
  );
}
