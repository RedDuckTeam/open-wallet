import React from "react";
import { WalletState } from "../messaging/protocol.js";
import { useStatus } from "./hooks/useStatus.js";
import { Splash } from "./components/primitives.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { Toaster } from "./components/shadcn/sonner.js";
import { Onboarding } from "./screens/Onboarding.js";
import { Unlock } from "./screens/Unlock.js";
import { Unlocked } from "./screens/Unlocked.js";
import { Approval } from "./screens/Approval.js";

// The background opens dApp approvals as popup.html#approve/<id>. When that hash
// is present this window is an approval prompt, not the wallet.
function approvalId(): string | null {
  const prefix = "#approve/";
  return window.location.hash.startsWith(prefix) ? window.location.hash.slice(prefix.length) : null;
}

export function App(): React.ReactElement {
  const approval = approvalId();
  return (
    <>
      <ErrorBoundary>{approval ? <Approval id={approval} /> : <Routes />}</ErrorBoundary>
      <Toaster />
    </>
  );
}

function Routes(): React.ReactElement {
  const { status, refresh } = useStatus();
  const reload = (): void => {
    void refresh();
  };

  if (!status) return <Splash />;

  switch (status.state) {
    case WalletState.NoVault:
      return <Onboarding onDone={reload} />;
    case WalletState.Locked:
      return <Unlock onUnlocked={reload} />;
    case WalletState.Unlocked:
      return status.account ? (
        <Unlocked status={status} account={status.account} reload={reload} />
      ) : (
        <Splash />
      );
    default:
      return <Splash />;
  }
}
