import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import type { AccountView } from "../../messaging/protocol.js";
import { Avatar, Screen } from "../components/primitives.js";
import { Button } from "../components/shadcn/button.js";

export function Receive({
  account,
  onBack,
}: {
  account: AccountView;
  onBack: () => void;
}): React.ReactElement {
  const copy = (): void => {
    void navigator.clipboard.writeText(account.address);
    toast.success("Address copied");
  };

  return (
    <Screen title="Receive" onBack={onBack}>
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="flex items-center gap-2">
          <Avatar seed={account.address} size={22} />
          <span className="text-sm font-semibold">{account.name}</span>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <QRCodeSVG value={account.address} size={180} bgColor="#ffffff" fgColor="#111827" />
        </div>
        <p className="bg-muted break-all rounded-lg px-3 py-2 text-center font-mono text-[13px]">
          {account.address}
        </p>
      </div>
      <Button className="w-full" onClick={copy}>
        <Copy />
        Copy address
      </Button>
    </Screen>
  );
}
