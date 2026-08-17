import type { AccountErrorCode } from './types.ts'

/** Account failure with a stable code safe for client branching. */
export class AccountError extends Error {
  /** Stable machine-readable failure code. */
  readonly code: AccountErrorCode

  /**
   * @param code - stable failure category.
   * @param message - safe diagnostic without credentials or signed values.
   */
  constructor(code: AccountErrorCode, message: string) {
    super(message)
    this.name = 'AccountError'
    this.code = code
  }
}
