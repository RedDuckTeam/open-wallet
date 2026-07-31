import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { walletApi } from "../../messaging/client.js";
import type { AssetView } from "../../messaging/protocol.js";
import { errorMessage } from "../format/error.js";

const POLL_MS = 20_000;

interface AssetsState {
  readonly assets: readonly AssetView[] | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly reload: () => void;
}

const AssetsContext = createContext<AssetsState | null>(null);

// One reactive source of balances for the whole popup: fetches on account/network
// change, polls to stay fresh, and re-fetches on demand after a send/swap. Keeps
// the last good data on a failed poll instead of flashing empty.
export function AssetsProvider({
  accountId,
  networkId,
  children,
}: {
  accountId: string;
  networkId: string;
  children: React.ReactNode;
}): React.ReactElement {
  const [assets, setAssets] = useState<readonly AssetView[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const key = `${accountId}:${networkId}`;

  const fetchAssets = useCallback((reset: boolean) => {
    const id = ++request.current;
    if (reset) setAssets(null);
    setLoading(true);
    walletApi.getAssets().then(
      (next) => {
        if (id !== request.current) return;
        setAssets(next);
        setError(null);
        setLoading(false);
      },
      (e: unknown) => {
        if (id !== request.current) return;
        setError(errorMessage(e));
        setLoading(false);
      },
    );
  }, []);

  // Different account/network: drop the old data and reload.
  useEffect(() => fetchAssets(true), [key, fetchAssets]);

  useEffect(() => {
    const timer = setInterval(() => fetchAssets(false), POLL_MS);
    return () => clearInterval(timer);
  }, [key, fetchAssets]);

  const reload = useCallback(() => fetchAssets(false), [fetchAssets]);
  const value = useMemo<AssetsState>(
    () => ({ assets, loading, error, reload }),
    [assets, loading, error, reload],
  );

  return <AssetsContext.Provider value={value}>{children}</AssetsContext.Provider>;
}

export function useAssets(): AssetsState {
  const context = useContext(AssetsContext);
  if (!context) throw new Error("useAssets must be used within AssetsProvider");
  return context;
}
