/**
 * Structured error class for ambiguous delivery outcomes (network timeout, 5xx, gateway error).
 * Carries isAmbiguous: true to guarantee caller never blindly retries.
 *
 * @module @deepseek-ai/dsh-im-wangwang/errors
 */

export class WangwangAmbiguousError extends Error {
  /** Always true: marks the outcome as ambiguous so callers never blindly retry. */
  readonly isAmbiguous = true
  /** HTTP status of the ambiguous response, when one was received. */
  readonly httpStatus: number | undefined
  /** Raw upstream details (response body text or network error), for diagnostics. */
  readonly rawDetails: unknown

  constructor(message: string, options?: { httpStatus?: number; cause?: unknown; rawDetails?: unknown }) {
    super(message, options ? { cause: options.cause } : undefined)
    this.name = 'WangwangAmbiguousError'
    this.httpStatus = options?.httpStatus
    this.rawDetails = options?.rawDetails
  }
}
