import { REMOTE_PROTOCOL_LIMITS } from '@deepseek-ai/dsh-remote-protocol'
import { describe, expect, it } from 'vitest'
import { RelayInboundQueue } from '../src/relay-queue.ts'

describe('RelayInboundQueue', () => {
  it('admits an exact wire-limit frame and releases its byte ownership when consumed', async () => {
    const queue = new RelayInboundQueue({
      maxMessages: 1,
      maxBytes: REMOTE_PROTOCOL_LIMITS.relayMessageBytes,
    })
    const exact = new Uint8Array(REMOTE_PROTOCOL_LIMITS.relayMessageBytes)
    queue.push(exact)

    const iterator = queue[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toEqual({ done: false, value: exact })
    queue.push(Uint8Array.of(1))
    await expect(iterator.next()).resolves.toEqual({ done: false, value: Uint8Array.of(1) })
    queue.end()
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
  })

  it('fails closed for one oversized WebSocket message', async () => {
    const queue = new RelayInboundQueue({
      maxMessages: 2,
      maxBytes: REMOTE_PROTOCOL_LIMITS.relayMessageBytes * 2,
    })

    expect(() => { queue.push(new Uint8Array(REMOTE_PROTOCOL_LIMITS.relayMessageBytes + 1)) })
      .toThrow('wire byte limit')
    await expect(queue[Symbol.asyncIterator]().next()).rejects.toMatchObject({ code: 'RELAY_ATTACHMENT_REJECTED' })
  })

  it('fails a blocked consumer when a slow source exceeds item or aggregate-byte bounds', async () => {
    for (const limits of [
      { maxMessages: 1, maxBytes: 10 },
      { maxMessages: 10, maxBytes: 1 },
    ]) {
      const queue = new RelayInboundQueue(limits)
      queue.push(Uint8Array.of(1))
      expect(() => { queue.push(Uint8Array.of(2)) }).toThrow('live queue exceeded')
      await expect(queue[Symbol.asyncIterator]().next()).rejects.toMatchObject({ code: 'RELAY_SLOW_CONSUMER' })
    }
  })

  it('rejects invalid live queue configuration and ignores frames after settlement', async () => {
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => new RelayInboundQueue({ maxMessages: value, maxBytes: 1 })).toThrow('positive integer')
    }
    const queue = new RelayInboundQueue({ maxMessages: 1, maxBytes: 1 })
    queue.end()
    queue.end()
    queue.push(Uint8Array.of(1))
    expect(queue.fail(new Error('late'))).toBeInstanceOf(Error)
    expect(queue.fail('still late')).toEqual(expect.objectContaining({ message: 'still late' }))
    await expect(queue[Symbol.asyncIterator]().next()).resolves.toEqual({ done: true, value: undefined })
  })

  it('settles a waiting consumer directly on push, close, or failure', async () => {
    const pushed = new RelayInboundQueue({ maxMessages: 1, maxBytes: 1 })
    const pushedNext = pushed[Symbol.asyncIterator]().next()
    await Promise.resolve()
    pushed.push(Uint8Array.of(1))
    await expect(pushedNext).resolves.toEqual({ done: false, value: Uint8Array.of(1) })

    const ended = new RelayInboundQueue({ maxMessages: 1, maxBytes: 1 })
    const endedNext = ended[Symbol.asyncIterator]().next()
    await Promise.resolve()
    ended.end()
    await expect(endedNext).resolves.toEqual({ done: true, value: undefined })

    const failed = new RelayInboundQueue({ maxMessages: 1, maxBytes: 1 })
    const failedNext = failed[Symbol.asyncIterator]().next()
    await Promise.resolve()
    failed.fail(new Error('socket failed'))
    await expect(failedNext).rejects.toThrow('socket failed')
  })
})
