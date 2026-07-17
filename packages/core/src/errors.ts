/**
 * Common supertype for openwallet's own error classes, modeled on viem's
 * `BaseError` — lets a caller write one `catch (e) { if (e instanceof
 * BaseError) }` that works across every chain package, instead of matching
 * on each chain's own error class or parsing a message string.
 */
export class BaseError extends Error {
  readonly shortMessage: string;
  readonly details: string | undefined;

  constructor(shortMessage: string, details?: string) {
    super(details ? `${shortMessage}\n\nDetails: ${details}` : shortMessage);
    this.name = "BaseError";
    this.shortMessage = shortMessage;
    this.details = details;
  }
}

/** A fee bump (replace-by-fee, speed up, cancel) didn't raise the fee enough to be accepted as a valid replacement. */
export class FeeTooLowError extends BaseError {
  constructor(
    message = "The replacement fee is not high enough to replace the original transaction",
  ) {
    super(message);
    this.name = "FeeTooLowError";
  }
}

/** The selected funds (UTXOs, balance) don't cover the requested amount plus fee. */
export class InsufficientFundsError extends BaseError {
  constructor(message = "Insufficient funds to cover the requested amount plus fee") {
    super(message);
    this.name = "InsufficientFundsError";
  }
}

/** An address failed a chain's `ChainAdapter.validate` syntactic check. */
export class InvalidAddressError extends BaseError {
  constructor(message = "Invalid address") {
    super(message);
    this.name = "InvalidAddressError";
  }
}
