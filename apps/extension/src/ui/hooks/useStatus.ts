import { useCallback, useEffect, useState } from "react";
import { walletApi } from "../../messaging/client.js";
import type { WalletStatus } from "../../messaging/protocol.js";
import { notifyError } from "../format/error.js";

export interface UseStatus {
  readonly status: WalletStatus | null;
  readonly loading: boolean;
  readonly refresh: () => Promise<void>;
}

// Loads the wallet's high-level state; refresh() re-queries on demand.
export function useStatus(): UseStatus {
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await walletApi.getStatus());
    } catch (error) {
      // No inline home for a status load, so surface it as a toast.
      notifyError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, refresh };
}
