/** Failure-safe cleanup stack for disposable native proof resources. */
export class CleanupStack {
  #steps = []

  /**
   * Register one cleanup action.
   * @param {string} label Human-readable resource action.
   * @param {() => void | Promise<void>} action Cleanup action.
   * @returns {void}
   */
  defer(label, action) {
    this.#steps.push({ action, label })
  }

  /**
   * Run every cleanup action in reverse acquisition order and preserve all failures.
   * @param {unknown} primaryError Failure from the owned operation, when present.
   * @returns {Promise<void>}
   */
  async finish(primaryError) {
    const failures = []
    for (const { action, label } of this.#steps.reverse()) {
      try {
        await action()
      } catch (error) {
        failures.push(new Error(`${label}: ${errorMessage(error)}`, { cause: error }))
      }
    }
    if (primaryError !== undefined && failures.length > 0) {
      throw new AggregateError(
        [asError(primaryError), ...failures],
        `${errorMessage(primaryError)}; ${failures.length} cleanup action(s) failed`,
        { cause: primaryError },
      )
    }
    if (primaryError !== undefined) throw primaryError
    if (failures.length > 0) {
      throw new AggregateError(failures, `${failures.length} cleanup action(s) failed`)
    }
  }
}

/**
 * Require a synchronous child-process result to succeed.
 * @param {{ error?: Error, signal?: string | null, status?: number | null }} result Process result.
 * @param {string} description Command description.
 * @returns {void}
 */
export function requireSpawnSuccess(result, description) {
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${description} exited with ${result.signal ?? result.status ?? 'unknown status'}`)
  }
}

/**
 * Return an Error while preserving existing Error instances.
 * @param {unknown} value Thrown value.
 * @returns {Error}
 */
function asError(value) {
  return value instanceof Error ? value : new Error(String(value))
}

/**
 * Render an unknown thrown value for aggregate diagnostics.
 * @param {unknown} value Thrown value.
 * @returns {string}
 */
function errorMessage(value) {
  return value instanceof Error ? value.message : String(value)
}
