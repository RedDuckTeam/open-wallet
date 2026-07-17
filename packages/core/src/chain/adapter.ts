/**
 * A chain's address-validation function: a pure syntactic check (no
 * network calls) for whether a string is a well-formed address on that
 * chain. Carved out ahead of the rest of the `ChainAdapter` contract so
 * chain packages could annotate their `isValidAddress` export first.
 */
export type AddressValidator = (address: string) => boolean;

/**
 * A native-currency send in the one shape every chain's adapter accepts.
 * `amount` is always the chain's base unit (wei / lamports / sats) as a
 * `bigint`, so the same request drives an EVM, Solana, or Bitcoin transfer
 * without a per-chain params type leaking into the caller. Lower-level,
 * chain-specific transfer params (viem `Address`, Solana `PublicKey`, a
 * UTXO set) stay inside each chain package and are marshalled at the
 * adapter boundary — see each `createXxxAdapter`.
 */
export interface NativeSendRequest {
  readonly from: string;
  readonly to: string;
  readonly amount: bigint;
}

/**
 * Token (non-native asset) operations — ERC-20 on EVM, SPL on Solana. The
 * single honest optional capability of `ChainAdapter`: a chain without a
 * token layer (Bitcoin) simply omits it. `TokenTransferParams` and
 * `UnsignedTx` are supplied by the owning `ChainTypes` so a token transfer
 * produces the exact same unsigned-transaction type as a native one and can
 * flow through the same `sign`/`broadcast` pipe.
 */
export interface TokenOperations<TokenTransferParams, UnsignedTx> {
  getBalance(token: string, owner: string): Promise<bigint>;
  buildTransfer(params: TokenTransferParams): Promise<UnsignedTx>;
}

/**
 * The chain-specific types of a `ChainAdapter`, bundled into one named pack
 * so the adapter takes a single readable type parameter instead of seven
 * positional ones. Every field defaults to `unknown` (never `any` —
 * `no-explicit-any` is an error): the registry stores adapters at this
 * all-`unknown` default, which erases the concrete types but keeps the
 * send-flow pipe sound because each step still consumes the previous step's
 * output of the *same* adapter.
 */
export interface ChainTypes {
  readonly UnsignedTx: unknown;
  readonly SignedTx: unknown;
  readonly Fees: unknown;
  readonly BroadcastResult: unknown;
  readonly Message: unknown;
  readonly MessageSignature: unknown;
  readonly TokenTransferParams: unknown;
}

/**
 * The uniform contract every chain package exposes through its
 * `createXxxAdapter` factory. A consumer that only needs the chain-agnostic
 * send flow (`validate → buildTransfer → estimateFees → sign → broadcast`)
 * can drive any adapter through this interface alone; a consumer that needs
 * chain-specific outputs or token operations holds the concrete
 * `ChainAdapter<XxxChainTypes>` the factory returns.
 *
 * The send-flow operations are declared with **method syntax**
 * (`sign(unsigned, key): ...`), not function-typed properties
 * (`sign: (unsigned, key) => ...`), on purpose: upcasting a concrete
 * `ChainAdapter<EvmChainTypes>` to the registry's all-`unknown`
 * `ChainAdapter` relies on the parameter *bivariance* that TypeScript only
 * grants method syntax. As function properties, `strictFunctionTypes` would
 * make the parameters contravariant and reject the upcast, breaking
 * `ChainRegistry.register`. New chains must follow the same convention.
 */
export interface ChainAdapter<T extends ChainTypes = ChainTypes> {
  readonly id: string;
  isValidAddress: AddressValidator;
  /**
   * Throws `InvalidAddressError` when either `from` or `to` fails
   * `isValidAddress`. Both are checked so a bad `from` surfaces here rather
   * than later as a raw viem/`PublicKey` error from address marshalling in
   * `buildTransfer`.
   */
  validate(request: NativeSendRequest): void;
  /**
   * Call `validate` first: invoked directly with a malformed address, this
   * (like `getNativeBalance`) surfaces the chain library's own error from
   * address marshalling, not `InvalidAddressError`.
   */
  buildTransfer(request: NativeSendRequest): Promise<T["UnsignedTx"]>;
  estimateFees(request: NativeSendRequest): Promise<T["Fees"]>;
  sign(unsigned: T["UnsignedTx"], privateKey: Uint8Array): Promise<T["SignedTx"]> | T["SignedTx"];
  broadcast(signed: T["SignedTx"]): Promise<T["BroadcastResult"]>;
  getNativeBalance(address: string): Promise<bigint>;
  signMessage(
    message: T["Message"],
    privateKey: Uint8Array,
  ): Promise<T["MessageSignature"]> | T["MessageSignature"];
  readonly tokens?: TokenOperations<T["TokenTransferParams"], T["UnsignedTx"]>;
}
