import React, { useState } from "react";
import { Check, ChevronDown, Plus, Settings2 } from "lucide-react";
import { walletApi } from "../../messaging/client.js";
import type { ChainKind, NetworkView } from "../../messaging/protocol.js";
import { CHAIN_KINDS, CHAIN_KIND_ORDER } from "../../chain-kinds.js";
import { NetworkDot, Screen } from "../components/primitives.js";
import { Badge } from "../components/shadcn/badge.js";
import { Button } from "../components/shadcn/button.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../components/shadcn/collapsible.js";
import { usePersistentToggle } from "../hooks/usePersistentToggle.js";
import { AddNetwork } from "./AddNetwork.js";
import { EditNetwork } from "./EditNetwork.js";

type Sub = { view: "list" } | { view: "add" } | { view: "edit"; network: NetworkView };

// Network switcher and management hub. Each family shows its primary mainnet;
// the rest (L2s, testnets, custom) collapse into its dropdown.
export function Networks({
  networks: initial,
  activeId,
  onBack,
  onDone,
}: {
  networks: readonly NetworkView[];
  activeId: string;
  onBack: () => void;
  onDone: () => void;
}): React.ReactElement {
  const [networks, setNetworks] = useState<readonly NetworkView[]>(initial);
  const [sub, setSub] = useState<Sub>({ view: "list" });

  const backToList = (): void => setSub({ view: "list" });
  const afterMutation = (updated: readonly NetworkView[]): void => {
    setNetworks(updated);
    setSub({ view: "list" });
  };

  if (sub.view === "add") {
    return <AddNetwork onBack={backToList} onAdded={afterMutation} />;
  }
  if (sub.view === "edit") {
    const current = networks.find((n) => n.id === sub.network.id) ?? sub.network;
    return <EditNetwork network={current} onBack={backToList} onChanged={afterMutation} />;
  }

  const select = (id: string): void => {
    void walletApi.selectNetwork(id).then(onDone);
  };
  const edit = (network: NetworkView): void => setSub({ view: "edit", network });

  return (
    <Screen title="Networks" onBack={onBack}>
      {CHAIN_KIND_ORDER.map((kind) => {
        const group = networks.filter((n) => n.kind === kind);
        if (group.length === 0) return null;
        return (
          <NetworkGroup
            key={kind}
            kind={kind}
            group={group}
            activeId={activeId}
            onSelect={select}
            onEdit={edit}
            onAddNetwork={
              CHAIN_KINDS[kind].supportsCustomNetworks ? () => setSub({ view: "add" }) : undefined
            }
          />
        );
      })}
    </Screen>
  );
}

// One chain family: primary network + the rest in a collapsible dropdown.
function NetworkGroup({
  kind,
  group,
  activeId,
  onSelect,
  onEdit,
  onAddNetwork,
}: {
  kind: ChainKind;
  group: readonly NetworkView[];
  activeId: string;
  onSelect: (id: string) => void;
  onEdit: (network: NetworkView) => void;
  // Set for EVM only; renders the "Add network" button.
  onAddNetwork?: () => void;
}): React.ReactElement {
  const [open, setOpen] = usePersistentToggle(`networks.${kind}`);
  const head = group.find((n) => n.isPrimary) ?? group[0];
  const subs = group.filter((n) => n.id !== head.id);

  return (
    <div className="flex flex-col gap-1.5">
      <NetworkRow
        network={head}
        active={head.id === activeId}
        onSelect={() => onSelect(head.id)}
        onEdit={() => onEdit(head)}
      />
      {subs.length > 0 || onAddNetwork ? (
        <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-1.5 pl-3">
          <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-semibold">
            <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
            {subs.length} more
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-1.5">
            {subs.map((network) => (
              <NetworkRow
                key={network.id}
                network={network}
                active={network.id === activeId}
                onSelect={() => onSelect(network.id)}
                onEdit={() => onEdit(network)}
              />
            ))}
            {/* Always last, after every network in the family. */}
            {onAddNetwork ? (
              <Button variant="outline" size="sm" className="w-full" onClick={onAddNetwork}>
                <Plus />
                Add network
              </Button>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

function NetworkRow({
  network,
  active,
  onSelect,
  onEdit,
}: {
  network: NetworkView;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
}): React.ReactElement {
  return (
    <div
      className={`flex items-center rounded-lg border ${
        active ? "border-primary bg-primary/5" : ""
      }`}
    >
      <button className="flex flex-1 items-center gap-3 px-3 py-3 text-left" onClick={onSelect}>
        <NetworkDot color={network.color} size={10} />
        <span className="text-sm font-semibold">{network.name}</span>
        <span className="text-muted-foreground text-[12px]">{network.symbol}</span>
        {network.isCustom ? (
          <Badge variant="secondary" className="text-[10px]">
            Custom
          </Badge>
        ) : null}
        {active ? <Check className="text-primary ml-auto size-4" /> : null}
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground mr-1 size-8"
        onClick={onEdit}
        aria-label={`Edit ${network.name}`}
      >
        <Settings2 />
      </Button>
    </div>
  );
}
