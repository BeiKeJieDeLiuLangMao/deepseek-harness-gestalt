/** Plugin-owned serialization for Schedule reads, delivery, and mutations. */

import type { SessionId } from '@deepseek-ai/dsh-session'

/** One Schedule plugin lifecycle's per-Session FIFO and teardown barrier. */
export class ScheduleTransactions {
  private readonly tails = new Map<SessionId, Promise<void>>()
  private stopping = false

  /**
   * Run after prior work for the same Session in this owner.
   * @param sessionId - Exact Schedule owner and serialization key.
   * @param operation - Complete preflight, fold, mutation, and postflight operation.
   * @returns The operation result after exclusive execution.
   */
  async run<T>(sessionId: SessionId, operation: () => Promise<T>): Promise<T> {
    if (this.stopping) throw new Error('Schedule transactions are stopping')
    const prior = this.tails.get(sessionId) ?? Promise.resolve()
    const run = prior.then(operation)
    const tail = run.then(() => undefined, () => undefined)
    this.tails.set(sessionId, tail)
    try {
      return await run
    } finally {
      if (this.tails.get(sessionId) === tail) this.tails.delete(sessionId)
    }
  }

  /**
   * Close admission and await every admitted transaction.
   * @returns A promise that settles after all admitted work becomes quiescent.
   */
  async dispose(): Promise<void> {
    this.stopping = true
    await Promise.allSettled([...this.tails.values()])
    this.tails.clear()
  }
}
