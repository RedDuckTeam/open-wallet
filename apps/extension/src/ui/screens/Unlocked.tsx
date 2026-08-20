import React, { useState } from "react";
import type { AccountView, WalletStatus } from "../../messaging/protocol.js";
import { AssetsProvider } from "../state/assets.js";
import { BottomNav, type Tab } from "../components/BottomNav.js";
import { Home, type HomeView } from "./Home.js";
import { Send } from "./Send.js";
import { Receive } from "./Receive.js";
import { Accounts } from "./Accounts.js";
import { Networks } from "./Networks.js";
import { AddToken } from "./AddToken.js";
import { Settings } from "./Settings.js";
import { SmartAccount } from "./SmartAccount.js";
import { Nfts } from "./Nfts.js";
import { Swap } from "./Swap.js";
import { ConnectedSites } from "./ConnectedSites.js";

type View = Tab | HomeView;

const TABS: readonly Tab[] = ["home", "swap"];
const asTab = (view: View): Tab | null => (TABS.includes(view as Tab) ? (view as Tab) : null);

export function Unlocked({
  status,
  account,
  reload,
}: {
  status: WalletStatus;
  account: AccountView;
  reload: () => void;
}): React.ReactElement {
  const [view, setView] = useState<View>("home");
  // Testnet mode has no swap (aggregators don't route testnets): the swap
  // view falls back to home, and with one tab left the bar disappears too.
  const effectiveView = status.testnetMode && view === "swap" ? "home" : view;
  const back = (): void => setView("home");
  const backAndReload = (): void => {
    back();
    reload();
  };

  const content = ((): React.ReactElement => {
    switch (effectiveView) {
      case "send":
        return <Send network={status.network} onBack={back} onSent={backAndReload} />;
      case "receive":
        return <Receive account={account} onBack={back} />;
      case "accounts":
        return (
          <Accounts
            accounts={status.accounts}
            activeId={account.id}
            onBack={backAndReload}
            onDone={backAndReload}
          />
        );
      case "networks":
        return (
          <Networks
            networks={status.networks}
            activeId={status.network.id}
            onBack={back}
            onDone={backAndReload}
          />
        );
      case "addToken":
        return <AddToken onBack={back} onAdded={backAndReload} />;
      case "settings":
        return (
          <Settings
            testnetMode={status.testnetMode}
            onBack={back}
            onLocked={reload}
            onReset={reload}
            onNav={setView}
            onModeChanged={reload}
          />
        );
      case "nfts":
        return <Nfts network={status.network} onBack={back} />;
      case "smartAccount":
        return <SmartAccount network={status.network} onBack={() => setView("settings")} />;
      case "connectedSites":
        return <ConnectedSites onBack={back} />;
      case "swap":
        return <Swap network={status.network} />;
      default:
        return <Home status={status} account={account} onNav={setView} />;
    }
  })();

  const tab = asTab(effectiveView);

  return (
    <AssetsProvider accountId={account.id} networkId={status.network.id}>
      <div className="flex flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{content}</div>
        {tab && !status.testnetMode ? <BottomNav active={tab} onSelect={setView} /> : null}
      </div>
    </AssetsProvider>
  );
}
