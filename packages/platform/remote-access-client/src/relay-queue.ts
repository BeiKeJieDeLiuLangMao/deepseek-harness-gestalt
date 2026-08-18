import { RemoteRelayError } from '@deepseek-ai/dsh-remote-access'
import { REMOTE_PROTOCOL_LIMITS } from '@deepseek-ai/dsh-remote-protocol'

/** Fixed live inbound bounds; Relay never buffers an offline stream. */
export interface RelayInboundQueueLimits {
  /** Maximum complete frames waiting for the endpoint consumer. */
  maxMessages: number
  /** Maximum aggregate frame bytes waiting for the endpoint consumer. */
  maxBytes: number
}

/** Bounded single-consumer queue for complete Relay Transport frames. */
export class RelayInboundQueue implements AsyncIterable<Uint8Array> {
  private readonly values: Uint8Array[] = []
  private readonly waits: Array<{
    resolve(value: IteratorResult<Uint8Array>): void
    reject(error: unknown): void
  }> = []
  private bufferedBytes = 0
  private ended = false
  private failure: Error | undefined

  /** @param limits - validated live item and aggregate-byte ceilings. */
  constructor(private readonly limits: RelayInboundQueueLimits) {
    for (const [name, value] of Object.entries(limits)) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new TypeError(`Relay inbound ${name} must be a positive integer`)
      }
    }
  }

  /**
   * Admit one complete live frame or fail the queue closed.
   * @param value - one WebSocket message.
   */
  push(value: Uint8Array): void {
    if (this.ended) return
    if (value.byteLength > REMOTE_PROTOCOL_LIMITS.relayMessageBytes) {
      throw this.fail(new RemoteRelayError('RELAY_ATTACHMENT_REJECTED', 'Relay frame exceeds its wire byte limit'))
    }
    const wait = this.waits.shift()
    if (wait !== undefined) {
      wait.resolve({ done: false, value })
      return
    }
    if (this.values.length >= this.limits.maxMessages || this.bufferedBytes + value.byteLength > this.limits.maxBytes) {
      throw this.fail(new RemoteRelayError('RELAY_SLOW_CONSUMER', 'Relay inbound live queue exceeded its limit'))
    }
    this.values.push(value)
    this.bufferedBytes += value.byteLength
  }

  /** Finish the queue after the physical socket closes. */
  end(): void {
    if (this.ended) return
    this.ended = true
    for (const wait of this.waits.splice(0)) wait.resolve({ done: true, value: undefined })
  }

  /**
   * Fail the consumer and discard buffered live frames.
   * @param error - transport failure from the native socket or queue limit.
   * @returns the normalized Error retained by the queue.
   */
  fail(error: unknown): Error {
    const failure = error instanceof Error ? error : new Error(String(error), { cause: error })
    if (this.ended) return failure
    this.failure = failure
    this.ended = true
    this.values.length = 0
    this.bufferedBytes = 0
    for (const wait of this.waits.splice(0)) wait.reject(failure)
    return failure
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    while (true) {
      const value = this.values.shift()
      if (value !== undefined) {
        this.bufferedBytes -= value.byteLength
        yield value
        continue
      }
      if (this.failure !== undefined) throw this.failure
      if (this.ended) return
      const next = await new Promise<IteratorResult<Uint8Array>>((resolve, reject) => {
        this.waits.push({ resolve, reject })
      })
      if (next.done) return
      yield next.value
    }
  }
}
