/** Session-scoped serialization for Schedule reads, runtime delivery, and durable mutations. */

import type { SessionId } from '@deepseek-ai/dsh-session'

const tails = new Map<SessionId, Promise<void>>()

/**
 * Run one complete Schedule transaction after its exact Session's prior transaction.
 * @param sessionId - Exact Schedule owner and serialization key.
 * @param operation - Complete preflight, fold, mutation, and postflight operation.
 * @returns The operation result after exclusive execution.
 */
export async function runScheduleTransaction<T>(sessionId: SessionId, operation: () => Promise<T>): Promise<T> {
  const prior = tails.get(sessionId) ?? Promise.resolve()
  const run = prior.then(operation)
  const tail = run.then(() => undefined, () => undefined)
  tails.set(sessionId, tail)
  try {
    return await run
  } finally {
    if (tails.get(sessionId) === tail) tails.delete(sessionId)
  }
}
