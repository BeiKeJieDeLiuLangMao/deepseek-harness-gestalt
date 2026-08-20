import type { AccountErrorCode } from './types.ts'

/** Account failure with a stable code safe for client branching. */
export class AccountError extends Error {
  /** Stable machine-readable failure code. */
  readonly code: AccountErrorCode
  /** Retry delay in seconds present on quota and capacity failures. */
  readonly retryAfter?: number

  /**
   * @param code - stable failure category.
   * @param message - safe diagnostic without credentials or signed values.
   * @param retryAfter - retry delay in seconds for quota and capacity failures.
   */
  constructor(code: AccountErrorCode, message: string, retryAfter?: number) {
    super(message)
    this.name = 'AccountError'
    this.code = code
    if (retryAfter !== undefined) this.retryAfter = retryAfter
  }
}
