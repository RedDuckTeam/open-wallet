import {
  broadcastTransaction,
  buildNftTransfer,
  buildTransaction,
  createEvmClient,
  encodeCreateTbaAccount,
  encodeErc20Transfer,
  encodeTbaExecute,
  ERC6551_REGISTRY,
  getErc20Metadata,
  getNativeBalance,
  getTbaAddress,
  isTbaDeployed,
  readNft,
  signTransaction,
  type NftItem,
  type NftStandard,
  type NftTransferParams,
} from "@openwallet/chain-evm";
import type { Address, Hex, PublicClient } from "viem";
import { ChainKind } from "../messaging/protocol.js";
import type { EvmNetwork, NetworkConfig } from "../config/networks.js";
import type { ActiveSigner } from "./active-signer.js";
import type { BackendClient } from "./adapters/backend.js";
import type { SettingsService } from "./services/settings-service.js";
import { toBaseUnits } from "../units.js";

export interface NftListing {
  readonly items: readonly NftItem[];
  readonly nextCursor: string | null;
  /**
   * Whether an indexer answered. False means the list contains only manually
   * added NFTs — the UI must say so rather than presenting it as "everything
   * you own", which is the difference between an empty wallet and an
   * unconfigured one.
   */
  readonly indexed: boolean;
}

export interface TbaInfo {
  readonly address: Address;
  readonly deployed: boolean;
  /** What the account itself holds, in wei. It can receive before it's deployed. */
  readonly nativeBalanceWei: bigint;
}

/** One asset moving out of a token bound account: native when `token` is absent. */
export interface TbaSend {
  readonly to: string;
  /** Human-readable amount; decimals are resolved from the asset. */
  readonly amount: string;
  readonly token?: string;
}

/**
 * The platform seam for NFTs and their token bound accounts, alongside
 * `chains.ts` and `smart-account.ts`.
 *
 * Listing is deliberately two-sourced. Enumerating what an address owns is not
 * a question a node can answer — there is no such call — so it needs an
 * indexer, which may be absent. Reading one *known* (contract, tokenId) is
 * pure chain work and always available. The wallet therefore always supports
 * adding an NFT by hand, and treats the indexer as an enrichment rather than a
 * dependency, the same way MetaMask pairs auto-detection with "import NFT".
 */
export interface NftService {
  list(network: NetworkConfig, owner: string, cursor?: string): Promise<NftListing>;
  read(
    network: NetworkConfig,
    contract: string,
    tokenId: string,
    owner: string,
  ): Promise<NftItem | null>;
  transfer(
    network: NetworkConfig,
    params: {
      readonly standard: NftStandard;
      readonly contract: string;
      readonly tokenId: string;
      readonly from: string;
      readonly to: string;
      readonly amount?: string;
    },
    signer: ActiveSigner,
  ): Promise<string>;
  tokenBoundAccount(network: NetworkConfig, contract: string, tokenId: string): Promise<TbaInfo>;
  /**
   * Moves an asset out of the account bound to an NFT.
   *
   * Authority comes from the *signer being the NFT's current owner*, which the
   * account verifies on-chain — nothing here grants it. The wallet only wraps
   * the intended call in `execute` and sends it to the account.
   */
  sendFromTokenBoundAccount(
    network: NetworkConfig,
    contract: string,
    tokenId: string,
    send: TbaSend,
    signer: ActiveSigner,
  ): Promise<string>;
  deployTokenBoundAccount(
    network: NetworkConfig,
    contract: string,
    tokenId: string,
    signer: ActiveSigner,
  ): Promise<string>;
}

const MANUAL_LIMIT = 200;

export function createNftService(settings: SettingsService, backend: BackendClient): NftService {
  function requireEvm(network: NetworkConfig): EvmNetwork {
    if (network.kind !== ChainKind.Evm) {
      throw new Error(`${network.name} doesn't support NFTs`);
    }
    return network;
  }

  function clientFor(network: EvmNetwork): PublicClient {
    return createEvmClient(network.rpcUrl, network.chain);
  }

  /**
   * Signs and broadcasts one EVM transaction. Duplicated from `chains.ts`
   * rather than routed through the `ChainAdapter` pipe because that contract
   * speaks native and fungible-token transfers; an NFT move is neither, and
   * bending it through `NativeSendRequest` would mean encoding a token id
   * into an amount field.
   */
  async function sendTx(
    network: EvmNetwork,
    from: Address,
    to: Address,
    data: Hex,
    signer: ActiveSigner,
  ): Promise<string> {
    const client = clientFor(network);
    const unsigned = await buildTransaction(client, { from, to, data });
    const signed = await signer.withPrivateKey((privateKey) =>
      signTransaction(privateKey, unsigned),
    );
    return broadcastTransaction(client, signed);
  }

  return {
    async list(network, owner, cursor): Promise<NftListing> {
      const evm = requireEvm(network);
      const client = clientFor(evm);
      // Manual entries belong to the first page only; paging is the indexer's.
      const manual = cursor ? [] : settings.nfts(evm.id).slice(0, MANUAL_LIMIT);

      // Nothing leaves the device unless the user turned autodetection on, and
      // the indexer failing must not hide manually added NFTs: those are the
      // ones the user explicitly cared about.
      const indexed = settings.autodetectNfts
        ? await backend
            .nfts(evm.chain.id, owner, 50, cursor)
            .catch(() => ({ nfts: [], nextCursor: null, indexed: false }))
        : { nfts: [], nextCursor: null, indexed: false };

      const fromIndexer: NftItem[] = indexed.nfts.map((nft) => ({
        standard: nft.standard,
        contract: nft.contract as Address,
        tokenId: BigInt(nft.tokenId),
        collection: nft.collection,
        balance: BigInt(nft.balance),
        metadata: {
          name: nft.name,
          description: nft.description,
          imageUrl: nft.imageUrl,
          attributes: [],
        },
      }));

      // Manual entries the indexer already returned are dropped, so an NFT a
      // user added by hand before auto-detection caught up isn't listed twice.
      const seen = new Set(fromIndexer.map((nft) => key(nft.contract, nft.tokenId)));
      const extra = await Promise.all(
        manual
          .filter((nft) => !seen.has(key(nft.contract, BigInt(nft.tokenId))))
          .map((nft) =>
            readNft(client, nft.contract as Address, BigInt(nft.tokenId), owner as Address),
          ),
      );

      return {
        items: [...fromIndexer, ...extra.filter((item): item is NftItem => item !== null)],
        nextCursor: indexed.nextCursor,
        indexed: indexed.indexed,
      };
    },

    async read(network, contract, tokenId, owner): Promise<NftItem | null> {
      const evm = requireEvm(network);
      return readNft(clientFor(evm), contract as Address, BigInt(tokenId), owner as Address);
    },

    async transfer(network, params, signer): Promise<string> {
      const evm = requireEvm(network);
      const transferParams: NftTransferParams = {
        standard: params.standard,
        contract: params.contract as Address,
        tokenId: BigInt(params.tokenId),
        from: params.from as Address,
        to: params.to as Address,
        ...(params.amount !== undefined && { amount: BigInt(params.amount) }),
      };
      const client = clientFor(evm);
      const unsigned = await buildNftTransfer(client, transferParams);
      const signed = await signer.withPrivateKey((privateKey) =>
        signTransaction(privateKey, unsigned),
      );
      return broadcastTransaction(client, signed);
    },

    async tokenBoundAccount(network, contract, tokenId): Promise<TbaInfo> {
      const evm = requireEvm(network);
      const client = clientFor(evm);
      const address = await getTbaAddress(client, {
        chainId: evm.chain.id,
        tokenContract: contract as Address,
        tokenId: BigInt(tokenId),
      });
      const [deployed, nativeBalanceWei] = await Promise.all([
        isTbaDeployed(client, address),
        getNativeBalance(client, address),
      ]);
      return { address, deployed, nativeBalanceWei };
    },

    async sendFromTokenBoundAccount(network, contract, tokenId, send, signer): Promise<string> {
      const evm = requireEvm(network);
      const client = clientFor(evm);
      const account = await getTbaAddress(client, {
        chainId: evm.chain.id,
        tokenContract: contract as Address,
        tokenId: BigInt(tokenId),
      });
      // An undeployed account has no `execute` to call. Deployment is a
      // separate, explicit step rather than a silent side effect of sending.
      if (!(await isTbaDeployed(client, account))) {
        throw new Error("Deploy the token bound account before sending from it");
      }

      const inner = send.token
        ? await (async (): Promise<{ to: Address; value: bigint; data: Hex }> => {
            const { decimals } = await getErc20Metadata(client, send.token as Address);
            return {
              to: send.token as Address,
              value: 0n,
              data: encodeErc20Transfer({
                token: send.token as Address,
                to: send.to as Address,
                amount: toBaseUnits(send.amount, decimals),
              }),
            };
          })()
        : {
            to: send.to as Address,
            value: toBaseUnits(send.amount, evm.nativeDecimals),
            data: "0x" as Hex,
          };

      return sendTx(evm, signer.address as Address, account, encodeTbaExecute(inner), signer);
    },

    async deployTokenBoundAccount(network, contract, tokenId, signer): Promise<string> {
      const evm = requireEvm(network);
      const data = encodeCreateTbaAccount({
        chainId: evm.chain.id,
        tokenContract: contract as Address,
        tokenId: BigInt(tokenId),
      });
      // Deployment is permissionless — anyone may deploy any token's account,
      // and doing so grants no control — so this is an ordinary transaction
      // from whoever is paying, not an authorization step.
      return sendTx(evm, signer.address as Address, ERC6551_REGISTRY, data, signer);
    },
  };
}

function key(contract: string, tokenId: bigint): string {
  return `${contract.toLowerCase()}:${tokenId.toString()}`;
}
