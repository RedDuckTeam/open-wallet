import { http } from "viem";
import { createBundlerClient, createPaymasterClient } from "viem/account-abstraction";
import type { PublicClient } from "viem";
import type { BundlerClient } from "viem/account-abstraction";

/**
 * Where User Operations go, injected rather than hardcoded — the same
 * choice `chain-bitcoin/src/providers.ts` makes for UTXO/fee/broadcast
 * sources, and for the same reason: which bundler a wallet trusts is a
 * deployment decision, not a property of the protocol. Pimlico, Alchemy,
 * Candide and a self-hosted Rundler all speak the same `eth_sendUserOperation`
 * surface, so nothing here needs to know which one is behind the URL.
 */
export interface BundlerConfig {
  /** ERC-4337 bundler RPC endpoint. */
  readonly url: string;
  /**
   * ERC-7677 paymaster service, when sponsorship is wanted. Omit for
   * self-funded User Operations (the account pays its own gas).
   *
   * Set it to `true` to use the bundler's own `pm_*` methods — most hosted
   * bundlers expose the paymaster on the same endpoint — or to a URL when
   * the paymaster is a separate service.
   */
  readonly paymasterUrl?: string | true;
  /**
   * Opaque data forwarded to the paymaster with each sponsorship request
   * (policy id, API-specific hints). Passed through untouched: ERC-7677
   * defines the transport but leaves the contents to each provider.
   */
  readonly paymasterContext?: unknown;
}

/**
 * A bundler client bound to one chain's public client.
 *
 * The public client is passed in rather than created here so User Operation
 * preparation reads chain state (nonces, code, gas) through the very same
 * RPC endpoint the rest of the wallet uses — a bundler and a node that
 * disagree about the current state produce operations that estimate on one
 * chain view and execute on another.
 */
export function createBundler(client: PublicClient, config: BundlerConfig): BundlerClient {
  return createBundlerClient({
    client,
    transport: http(config.url),
    ...paymasterOptions(config),
  });
}

/**
 * Split out because the three cases are genuinely different wiring, not
 * three values of one option: no sponsorship at all, sponsorship from the
 * bundler's own endpoint (`true`), or sponsorship from a separate ERC-7677
 * service (a URL).
 */
function paymasterOptions(
  config: BundlerConfig,
): Pick<Parameters<typeof createBundlerClient>[0], "paymaster" | "paymasterContext"> {
  if (config.paymasterUrl === undefined) return {};
  const paymaster =
    config.paymasterUrl === true
      ? true
      : createPaymasterClient({ transport: http(config.paymasterUrl) });
  return {
    paymaster,
    ...(config.paymasterContext !== undefined && { paymasterContext: config.paymasterContext }),
  };
}
