import React, { useCallback, useEffect, useId, useState } from "react";
import { ImageOff, Plus } from "lucide-react";
import { walletApi } from "../../messaging/client.js";
import type { NetworkView, NftListView, NftView } from "../../messaging/protocol.js";
import { errorMessage } from "../format/error.js";
import { Callout, Field, Screen, Spinner } from "../components/primitives.js";
import { Button } from "../components/shadcn/button.js";
import { Label } from "../components/shadcn/label.js";
import { Switch } from "../components/shadcn/switch.js";
import { NftDetail } from "./NftDetail.js";

/**
 * The NFT list. Two sources on purpose (see `background/nfts.ts`): an indexer
 * when one is configured, plus anything the user added by hand. When no
 * indexer answered, the screen says so rather than showing an empty grid — an
 * unconfigured wallet and an empty one must not look the same.
 */
export function Nfts({
  network,
  onBack,
}: {
  network: NetworkView;
  onBack: () => void;
}): React.ReactElement {
  const [listing, setListing] = useState<NftListView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<NftView | null>(null);

  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setListing(await walletApi.getNfts());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  // Appends the next page rather than replacing: the indexer pages, and the
  // first page also carries the manually added NFTs, which must not vanish.
  const loadMore = useCallback(async (cursor: string): Promise<void> => {
    setLoadingMore(true);
    try {
      const next = await walletApi.getNfts(cursor);
      setListing((current) =>
        current ? { ...next, items: [...current.items, ...next.items] } : next,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (selected) {
    return (
      <NftDetail
        nft={selected}
        network={network}
        showMedia={listing?.displayMedia ?? false}
        onBack={() => setSelected(null)}
        onChanged={() => {
          setSelected(null);
          void load();
        }}
      />
    );
  }

  if (adding) {
    return (
      <AddNft
        onBack={() => setAdding(false)}
        onAdded={() => {
          setAdding(false);
          void load();
        }}
      />
    );
  }

  const action = listing?.supported ? (
    <Button variant="ghost" size="icon" onClick={() => setAdding(true)} aria-label="Add NFT">
      <Plus />
    </Button>
  ) : undefined;

  return (
    <Screen title="Collectibles" onBack={onBack} {...(action ? { action } : {})}>
      {error ? <Callout>{error}</Callout> : null}
      {!listing ? (
        <Spinner />
      ) : !listing.supported ? (
        <Callout tone="info">{network.name} doesn&apos;t support NFTs.</Callout>
      ) : (
        <>
          <Toggle
            label="Autodetect NFTs"
            hint="Sends this account's address to the OpenWallet API to look up what it holds."
            checked={listing.autodetect}
            onChange={(enabled) => walletApi.setNftAutodetect(enabled)}
            onChanged={setListing}
          />
          <Toggle
            label="Display media"
            hint="Loads images from wherever each collection hosts them, which reveals your IP to those hosts."
            checked={listing.displayMedia}
            onChange={(enabled) => walletApi.setNftMedia(enabled)}
            onChanged={setListing}
          />
          {listing.autodetect && !listing.indexed ? (
            <Callout tone="info">
              No indexer answered, so only NFTs you added by hand are shown. Check that the
              OpenWallet API is running and configured.
            </Callout>
          ) : null}
          {listing.items.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {listing.autodetect
                ? "Nothing found for this account on this network."
                : "Turn on autodetect, or add one with the button above."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {listing.items.map((nft) => (
                <NftCard
                  key={`${nft.contract}:${nft.tokenId}`}
                  nft={nft}
                  showMedia={listing.displayMedia}
                  onClick={() => setSelected(nft)}
                />
              ))}
            </div>
          )}
          {listing.nextCursor ? (
            <Button
              variant="secondary"
              className="w-full"
              disabled={loadingMore}
              onClick={() => void loadMore(listing.nextCursor ?? "")}
            >
              {loadingMore ? <Spinner /> : null}
              Load more
            </Button>
          ) : null}
        </>
      )}
    </Screen>
  );
}

/**
 * The two privacy switches, both of which exist because looking at an NFT
 * inevitably tells someone: enumerating holdings discloses the address to an
 * indexer, and rendering an image discloses the viewer's IP to whatever host
 * the collection chose. MetaMask ships the same pair for the same reasons.
 */
function Toggle({
  label,
  hint,
  checked,
  onChange,
  onChanged,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (enabled: boolean) => Promise<NftListView>;
  onChanged: (next: NftListView) => void;
}): React.ReactElement {
  const id = useId();
  const [busy, setBusy] = useState(false);
  return (
    <Label
      htmlFor={id}
      className="flex cursor-pointer items-start justify-between gap-3 font-normal"
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-[11.5px]">{hint}</span>
      </span>
      <Switch
        id={id}
        checked={checked}
        disabled={busy}
        onCheckedChange={(enabled) => {
          setBusy(true);
          void onChange(enabled)
            .then(onChanged)
            .finally(() => setBusy(false));
        }}
      />
    </Label>
  );
}

function NftCard({
  nft,
  showMedia,
  onClick,
}: {
  nft: NftView;
  showMedia: boolean;
  onClick: () => void;
}): React.ReactElement {
  const [broken, setBroken] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-accent flex flex-col gap-1.5 overflow-hidden rounded-lg border p-2 text-left transition-colors"
    >
      <div className="bg-muted flex aspect-square items-center justify-center overflow-hidden rounded-md">
        {showMedia && nft.imageUrl && !broken ? (
          <img
            src={nft.imageUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          // Metadata lives off-chain and goes missing routinely; a dead image
          // shouldn't leave a blank tile the user can't identify or click.
          <ImageOff className="text-muted-foreground size-6" />
        )}
      </div>
      <span className="truncate text-[13px] font-medium">{nft.name ?? `#${nft.tokenId}`}</span>
      <span className="text-muted-foreground truncate text-[11.5px]">
        {nft.collection ?? "Unknown collection"}
        {nft.balance !== "1" ? ` · ×${nft.balance}` : ""}
      </span>
    </button>
  );
}

function AddNft({
  onBack,
  onAdded,
}: {
  onBack: () => void;
  onAdded: () => void;
}): React.ReactElement {
  const [contract, setContract] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await walletApi.addNft(contract.trim(), tokenId.trim());
      onAdded();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Add collectible" onBack={onBack}>
      {error ? <Callout>{error}</Callout> : null}
      <Field label="Contract address" value={contract} onChange={setContract} autoFocus />
      <Field
        label="Token ID"
        value={tokenId}
        onChange={setTokenId}
        hint="The standard is detected from the contract."
      />
      <Button
        className="w-full"
        disabled={busy || !contract.trim() || !tokenId.trim()}
        onClick={() => void add()}
      >
        {busy ? <Spinner /> : null}
        Add
      </Button>
    </Screen>
  );
}
