import React from "react";
import { ArrowLeftRight, Wallet, type LucideIcon } from "lucide-react";

// Top-level sections reachable from the bottom bar.
export type Tab = "home" | "swap";

const ITEMS: readonly { readonly tab: Tab; readonly label: string; readonly icon: LucideIcon }[] = [
  { tab: "home", label: "Wallet", icon: Wallet },
  { tab: "swap", label: "Swap", icon: ArrowLeftRight },
];

export function BottomNav({
  active,
  onSelect,
}: {
  active: Tab;
  onSelect: (tab: Tab) => void;
}): React.ReactElement {
  return (
    <nav className="bg-background grid shrink-0 grid-cols-2 border-t">
      {ITEMS.map(({ tab, label, icon: Icon }) => {
        const isActive = tab === active;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onSelect(tab)}
            aria-current={isActive ? "page" : undefined}
            className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-5" />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
