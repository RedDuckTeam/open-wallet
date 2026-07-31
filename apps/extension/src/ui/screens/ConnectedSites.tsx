import React, { useEffect, useState } from "react";
import { Globe, Unplug } from "lucide-react";
import { walletApi } from "../../messaging/client.js";
import type { ConnectionView } from "../../messaging/protocol.js";
import { Screen, Spinner } from "../components/primitives.js";
import { Button } from "../components/shadcn/button.js";

// Manage which dApps may see the wallet. Disconnecting here revokes access and
// tells the site (accountsChanged -> []).
export function ConnectedSites({ onBack }: { onBack: () => void }): React.ReactElement {
  const [sites, setSites] = useState<ConnectionView[] | null>(null);

  useEffect(() => {
    walletApi.getConnections().then(setSites, () => setSites([]));
  }, []);

  return (
    <Screen title="Connected sites" onBack={onBack}>
      {sites === null ? (
        <div className="flex justify-center py-10">
          <Spinner className="text-muted-foreground size-6" />
        </div>
      ) : sites.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Globe className="text-muted-foreground size-10" />
          <p className="text-muted-foreground text-sm">
            No sites are connected. When you connect to a dApp it will appear here.
          </p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {sites.map((site) => (
              <Site
                key={site.origin}
                site={site}
                onDisconnect={() => void walletApi.disconnectSite(site.origin).then(setSites)}
              />
            ))}
          </ul>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => void walletApi.disconnectAllSites().then(setSites)}
          >
            <Unplug />
            Disconnect all
          </Button>
        </>
      )}
    </Screen>
  );
}

function Site({
  site,
  onDisconnect,
}: {
  site: ConnectionView;
  onDisconnect: () => void;
}): React.ReactElement {
  const [failed, setFailed] = useState(false);
  return (
    <li className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      {site.iconUrl && !failed ? (
        <img
          src={site.iconUrl}
          alt=""
          width={28}
          height={28}
          className="bg-muted size-7 rounded-full object-cover ring-1 ring-black/5"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="bg-muted text-muted-foreground grid size-7 place-items-center rounded-full">
          <Globe className="size-4" />
        </span>
      )}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold">{site.name}</span>
        <span className="text-muted-foreground truncate text-[12px]">{site.origin}</span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground ml-auto h-8"
        onClick={onDisconnect}
      >
        Disconnect
      </Button>
    </li>
  );
}
