import React, { useCallback, useEffect, useState } from "react";
import { ImageOff, Send, Wallet } from "lucide-react";
import { walletApi } from "../../messaging/client.js";
import type {
  NetworkView,
  NftAttributeView,
  NftView,
  TokenBoundAccountView,
} from "../../messaging/protocol.js";
import { errorMessage } from "../format/error.js";
import { formatUnits } from "../format/units.js";
import { truncateAddress } from "../format/text.js";
import { Callout, Field, Screen, Spinner } from "../components/primitives.js";
import { Button } from "../components/shadcn/button.js";
import { Badge } from "../components/shadcn/badge.js";
import { Separator } from "../components/shadcn/separator.js";

export function NftDetail({
  nft,
  network,
  showMedia,
  onBack,
  onChanged,
}: {
  nft: NftView;
  network: NetworkView;
  showMedia: boolean;
  onBack: () => void;
  onChanged: () => void;
}): React.ReactElement {
  return (
    <Screen title={nft.name ?? `#${nft.tokenId}`} onBack={onBack}>
      <Preview nft={nft} showMedia={showMedia} />
      <div className="flex flex-col gap-1 text-[12.5px]">
        <Row label="Collection" value={nft.collection ?? "Unknown"} />
        <Row label="Token ID" value={truncateTokenId(nft.tokenId)} />
        <Row label="Standard" value={nft.standard === "erc1155" ? "ERC-1155" : "ERC-721"} />
        <Row label="Contract" value={truncateAddress(nft.contract)} />
        {nft.balance !== "1" ? <Row label="Owned" value={nft.balance} /> : null}
      </div>
      {nft.description ? (
        <p className="text-muted-foreground text-[12.5px] leading-relaxed">{nft.description}</p>
      ) : null}
      <Attributes nft={nft} />
      <Separator />
      <TransferSection nft={nft} onSent={onChanged} />
      <Separator />
      <TokenBoundSection nft={nft} network={network} />
      <Button
        variant="ghost"
        className="w-full"
        onClick={() => {
          void walletApi.removeNft(nft.contract, nft.tokenId).then(onChanged);
        }}
      >
        Hide from list
      </Button>
    </Screen>
  );
}

function Preview({ nft, showMedia }: { nft: NftView; showMedia: boolean }): React.ReactElement {
  const [broken, setBroken] = useState(false);
  return (
    <div className="bg-muted flex aspect-square items-center justify-center overflow-hidden rounded-lg">
      {showMedia && nft.imageUrl && !broken ? (
        <img
          src={nft.imageUrl}
          alt=""
          className="size-full object-contain"
          onError={() => setBroken(true)}
        />
      ) : (
        <ImageOff className="text-muted-foreground size-10" />
      )}
    </div>
  );
}

/**
 * Traits, read on demand from the token's own metadata document.
 *
 * Not carried in the list payload because indexers report attributes
 * inconsistently — some omit them entirely — so reading the source here is
 * what makes the detail screen behave the same for an auto-detected NFT and a
 * manually added one.
 */
function Attributes({ nft }: { nft: NftView }): React.ReactElement | null {
  const [attributes, setAttributes] = useState<readonly NftAttributeView[]>([]);

  useEffect(() => {
    let cancelled = false;
    void walletApi
      .getNftDetail(nft.contract, nft.tokenId)
      .then((next) => {
        if (!cancelled) setAttributes(next);
      })
      // Metadata being unreachable is normal and not worth an error banner
      // when everything else on the screen still renders.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [nft.contract, nft.tokenId]);

  if (attributes.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {attributes.map((attribute) => (
        <span
          key={`${attribute.trait}:${attribute.value}`}
          className="bg-muted flex flex-col rounded-md border px-2 py-1"
        >
          <span className="text-muted-foreground text-[10.5px] uppercase">{attribute.trait}</span>
          <span className="text-[12px] font-medium">{attribute.value}</span>
        </span>
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

// A uint256 id can be 78 digits; showing all of it pushes the layout apart.
function truncateTokenId(tokenId: string): string {
  return tokenId.length > 14 ? `${tokenId.slice(0, 6)}…${tokenId.slice(-4)}` : tokenId;
}

function TransferSection({
  nft,
  onSent,
}: {
  nft: NftView;
  onSent: () => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const multi = nft.standard === "erc1155";

  if (!open) {
    return (
      <Button className="w-full" onClick={() => setOpen(true)}>
        <Send />
        Send
      </Button>
    );
  }

  const send = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await walletApi.sendNft({
        contract: nft.contract,
        tokenId: nft.tokenId,
        standard: nft.standard,
        to: to.trim(),
        ...(multi ? { amount: amount.trim() } : {}),
      });
      onSent();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {error ? <Callout>{error}</Callout> : null}
      <Field label="Recipient" value={to} onChange={setTo} autoFocus />
      {multi ? <Field label="Amount" value={amount} onChange={setAmount} /> : null}
      <Callout tone="info">
        Sent with safeTransferFrom, so a contract that can&apos;t receive it rejects the transfer
        instead of trapping it.
      </Callout>
      <Button className="w-full" disabled={busy || !to.trim()} onClick={() => void send()}>
        {busy ? <Spinner /> : null}
        Confirm send
      </Button>
      <Button variant="ghost" className="w-full" disabled={busy} onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}

/**
 * Moving assets out of a token bound account.
 *
 * The account acts only for whoever currently owns the NFT, and that check
 * happens on-chain — the wallet just wraps the intended call in `execute`.
 * Leaving the token address empty sends the native currency; filling it sends
 * that ERC-20, whose decimals are read from the contract rather than guessed.
 */
function TbaSend({
  nft,
  network,
  onSent,
}: {
  nft: NftView;
  network: NetworkView;
  onSent: () => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        <Send />
        Send from this account
      </Button>
    );
  }

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await walletApi.sendFromTokenBoundAccount({
        contract: nft.contract,
        tokenId: nft.tokenId,
        to: to.trim(),
        amount: amount.trim(),
        ...(token.trim() ? { token: token.trim() } : {}),
      });
      setOpen(false);
      setAmount("");
      onSent();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {error ? <Callout>{error}</Callout> : null}
      <Field label="Recipient" value={to} onChange={setTo} autoFocus />
      <Field
        label={`Amount (${network.symbol} unless a token is set)`}
        value={amount}
        onChange={setAmount}
      />
      <Field
        label="Token contract"
        value={token}
        onChange={setToken}
        hint="Leave empty to send the native currency."
      />
      <Button
        className="w-full"
        disabled={busy || !to.trim() || !amount.trim()}
        onClick={() => void submit()}
      >
        {busy ? <Spinner /> : null}
        Send
      </Button>
      <Button variant="ghost" className="w-full" disabled={busy} onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}

/**
 * The EIP-6551 account bound to this NFT. Its address exists whether or not
 * it's deployed — it can hold assets while counterfactual — so the address is
 * always shown and deployment is a separate, optional step.
 */
function TokenBoundSection({
  nft,
  network,
}: {
  nft: NftView;
  network: NetworkView;
}): React.ReactElement {
  const [tba, setTba] = useState<TokenBoundAccountView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setTba(await walletApi.getTokenBoundAccount(nft.contract, nft.tokenId));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [nft.contract, nft.tokenId]);

  useEffect(() => {
    void load();
  }, [load]);

  const deploy = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await walletApi.deployTokenBoundAccount(nft.contract, nft.tokenId);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Wallet className="size-4" />
          Token bound account
        </span>
        {tba ? (
          <Badge variant={tba.deployed ? "default" : "secondary"}>
            {tba.deployed ? "Deployed" : "Not deployed"}
          </Badge>
        ) : null}
      </div>
      {error ? <Callout>{error}</Callout> : null}
      {!tba ? (
        <Spinner />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 text-[12.5px]">
            <span className="text-muted-foreground font-mono">{truncateAddress(tba.address)}</span>
            <span className="font-medium">
              {formatUnits(tba.nativeBalanceWei, network.decimals)} {network.symbol}
            </span>
          </div>
          <p className="text-muted-foreground text-[11.5px]">
            This NFT owns that address on {network.name}. It can receive assets now; deploying lets
            it send them.
          </p>
          {tba.deployed ? (
            <TbaSend nft={nft} network={network} onSent={() => void load()} />
          ) : (
            <Button
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => void deploy()}
            >
              {busy ? <Spinner /> : null}
              Deploy account
            </Button>
          )}
        </>
      )}
    </div>
  );
}
