import {
  decodeRelayMessage,
  encodeRelayMessage,
  parseRelayAttachmentId,
  parseRelayCredential,
  parseRelayRouteId,
} from '@deepseek-ai/dsh-remote-protocol'
import { describe, expect, it, vi } from 'vitest'
import {
  RemoteRelayEndpointController,
  type RelayEndpointSocket,
} from '../src/index.ts'

describe('RemoteRelayEndpointController', () => {
  it('rejects invalid lifecycle configuration and Desktop without authoritative resync', () => {
    const base = {
      endpoint: 'mobile' as const,
      route: async () => ({
        routeId: parseRelayRouteId('route-one'),
        credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      }),
      attachmentId: () => parseRelayAttachmentId('mobile-one'),
      connect: async () => new FakeSocket(),
      heartbeatIntervalMs: 1,
      reconnectDelayMs: 1,
    }
    for (const field of ['heartbeatIntervalMs', 'reconnectDelayMs'] as const) {
      for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
        expect(() => new RemoteRelayEndpointController({ ...base, [field]: value })).toThrow('positive integer')
      }
    }
    expect(() => new RemoteRelayEndpointController({ ...base, endpoint: 'desktop' })).toThrow('resynchronize')
  })

  it('reconnects through a replacement instance and requests Desktop-authoritative resync without replay', async () => {
    const first = new FakeSocket()
    const replacement = new FakeSocket()
    const sockets = [first, replacement]
    const resynchronize = vi.fn(async (send: (target: ReturnType<typeof parseRelayAttachmentId>, value: Uint8Array) => Promise<void>) => {
      await send(parseRelayAttachmentId('mobile-one'), Uint8Array.of(9))
    })
    let attachment = 0
    const controller = new RemoteRelayEndpointController({
      endpoint: 'desktop',
      route: async () => ({
        routeId: parseRelayRouteId('route-one'),
        credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      }),
      attachmentId: () => parseRelayAttachmentId(`desktop-${String(++attachment)}`),
      connect: async () => {
        const socket = sockets.shift()
        if (socket === undefined) throw new Error('no replacement socket')
        return socket
      },
      heartbeatIntervalMs: 30_000,
      reconnectDelayMs: 1,
      resynchronize,
    })

    await controller.start()
    expect(resynchronize).toHaveBeenCalledTimes(1)
    expect(first.decoded().map(message => message.type)).toEqual(['attach', 'ciphertext'])
    first.end()
    await vi.waitFor(() => { expect(resynchronize).toHaveBeenCalledTimes(2) })
    expect(replacement.decoded().map(message => message.type)).toEqual(['attach', 'ciphertext'])
    expect(first.decoded()).toHaveLength(2)

    await controller.stop()
    await expect(controller.sendCiphertext(parseRelayAttachmentId('mobile-one'), Uint8Array.of(1)))
      .rejects.toMatchObject({ code: 'REMOTE_OFFLINE' })
  })

  it('stops immediately for window close, sleep, quit, or Mobile Access disablement', async () => {
    for (const reason of ['window-close', 'sleep', 'quit', 'mobile-access-disabled'] as const) {
      const socket = new FakeSocket()
      const controller = new RemoteRelayEndpointController({
        endpoint: 'desktop',
        route: async () => ({
          routeId: parseRelayRouteId('route-one'),
          credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
        }),
        attachmentId: () => parseRelayAttachmentId('desktop-one'),
        connect: async () => socket,
        heartbeatIntervalMs: 30_000,
        reconnectDelayMs: 1,
        resynchronize: async () => {},
      })
      await controller.start()

      await controller.stop(reason)

      expect(socket.closed).toBe(true)
      await expect(controller.sendCiphertext(parseRelayAttachmentId('mobile-one'), Uint8Array.of(1)))
        .rejects.toMatchObject({ code: 'REMOTE_OFFLINE' })
    }
  })

  it('receives ciphertext and content-free retryable errors while heartbeating with the supplied clock', async () => {
    vi.useFakeTimers()
    const socket = new FakeSocket()
    const onCiphertext = vi.fn()
    const onTransportError = vi.fn()
    const controller = new RemoteRelayEndpointController({
      endpoint: 'mobile',
      route: async () => ({
        routeId: parseRelayRouteId('route-one'),
        credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      }),
      attachmentId: () => parseRelayAttachmentId('mobile-one'),
      connect: async () => socket,
      heartbeatIntervalMs: 10,
      reconnectDelayMs: 1,
      clock: { now: () => 123 },
      onCiphertext,
      onTransportError,
    })
    await controller.start()
    await controller.start()
    socket.receive(encodeRelayMessage({
      type: 'ciphertext', transportVersion: 1, routeId: parseRelayRouteId('route-one'),
      sourceAttachmentId: parseRelayAttachmentId('desktop-one'),
      targetAttachmentId: parseRelayAttachmentId('mobile-one'), ciphertext: Uint8Array.of(3),
    }))
    socket.receive(encodeRelayMessage({
      type: 'error', transportVersion: 1, code: 'PLATFORM_CAPACITY', retryAfterMs: 50,
    }))
    socket.receive(encodeRelayMessage({
      type: 'error', transportVersion: 1, code: 'REMOTE_OFFLINE',
    }))
    await vi.waitFor(() => { expect(onCiphertext).toHaveBeenCalledOnce() })
    await vi.waitFor(() => { expect(onTransportError).toHaveBeenCalledTimes(2) })
    await vi.advanceTimersByTimeAsync(10)
    expect(socket.decoded()).toContainEqual({
      type: 'heartbeat', transportVersion: 1, attachmentId: parseRelayAttachmentId('mobile-one'), sentAt: 123,
    })
    await controller.stop()
    await controller.stop()
    vi.useRealTimers()
  })

  it('reconnects after protocol, socket, and route failures and reports stable transport errors', async () => {
    const firstSocket = new FakeSocket()
    const secondSocket = new FakeSocket()
    const sockets = [firstSocket, secondSocket]
    const onTransportError = vi.fn()
    let routeCalls = 0
    const controller = new RemoteRelayEndpointController({
      endpoint: 'mobile',
      route: async () => {
        routeCalls += 1
        if (routeCalls === 2) throw new Error('route lookup failed')
        return {
          routeId: parseRelayRouteId('route-one'),
          credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
        }
      },
      attachmentId: () => parseRelayAttachmentId('mobile-one'),
      connect: async () => {
        const socket = sockets.shift()
        if (socket === undefined) throw new Error('connect failed')
        return socket
      },
      heartbeatIntervalMs: 30_000,
      reconnectDelayMs: 1,
      onTransportError,
    })
    await controller.start()
    firstSocket.receive(encodeRelayMessage({
      type: 'error', transportVersion: 1, code: 'RELAY_ROUTE_REVOKED',
    }))
    await vi.waitFor(() => { expect(routeCalls).toBeGreaterThanOrEqual(3) })
    secondSocket.receive(encodeRelayMessage({
      type: 'attach', transportVersion: 1, routeId: parseRelayRouteId('route-one'),
      attachmentId: parseRelayAttachmentId('desktop-invalid'), endpoint: 'desktop',
      credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
    }))
    await vi.waitFor(() => { expect(onTransportError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RELAY_ATTACHMENT_REJECTED' }),
    ) })
    expect(onTransportError).toHaveBeenCalledWith(expect.objectContaining({ code: 'REMOTE_OFFLINE' }))
    await controller.stop()
  })

  it('closes a socket acquired after stop and rejects start before first attachment', async () => {
    const pending = deferred<RelayEndpointSocket>()
    const controller = new RemoteRelayEndpointController({
      endpoint: 'mobile',
      route: async () => ({
        routeId: parseRelayRouteId('route-one'),
        credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      }),
      attachmentId: () => parseRelayAttachmentId('mobile-one'),
      connect: async () => pending.promise,
      heartbeatIntervalMs: 30_000,
      reconnectDelayMs: 1,
    })
    const starting = controller.start()
    await Promise.resolve()
    const stopping = controller.stop()
    const socket = new FakeSocket()
    pending.resolve(socket)
    await expect(starting).rejects.toMatchObject({ code: 'REMOTE_OFFLINE' })
    await stopping
    expect(socket.closed).toBe(true)
  })

  it('drops buffered frames after stop and ignores a connection failure caused by that stop', async () => {
    const socket = new FakeSocket()
    const entered = deferred<undefined>()
    const release = deferred<undefined>()
    const onCiphertext = vi.fn(async () => { entered.resolve(undefined); await release.promise })
    const controller = new RemoteRelayEndpointController({
      endpoint: 'mobile',
      route: async () => ({
        routeId: parseRelayRouteId('route-one'),
        credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      }),
      attachmentId: () => parseRelayAttachmentId('mobile-one'),
      connect: async () => socket,
      heartbeatIntervalMs: 30_000,
      reconnectDelayMs: 1,
      onCiphertext,
    })
    await controller.start()
    const frame = encodeRelayMessage({
      type: 'ciphertext', transportVersion: 1, routeId: parseRelayRouteId('route-one'),
      sourceAttachmentId: parseRelayAttachmentId('desktop-one'),
      targetAttachmentId: parseRelayAttachmentId('mobile-one'), ciphertext: Uint8Array.of(1),
    })
    socket.receive(frame)
    socket.receive(frame)
    await entered.promise
    const stopping = controller.stop()
    release.resolve(undefined)
    await stopping
    expect(onCiphertext).toHaveBeenCalledOnce()

    const connect = deferred<RelayEndpointSocket>()
    const stoppedBeforeFailure = new RemoteRelayEndpointController({
      endpoint: 'mobile',
      route: async () => ({
        routeId: parseRelayRouteId('route-one'),
        credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      }),
      attachmentId: () => parseRelayAttachmentId('mobile-two'),
      connect: async () => connect.promise,
      heartbeatIntervalMs: 30_000,
      reconnectDelayMs: 1,
    })
    const starting = stoppedBeforeFailure.start()
    await Promise.resolve()
    const stopped = stoppedBeforeFailure.stop()
    connect.reject(new Error('stopped connection failed'))
    await expect(starting).rejects.toMatchObject({ code: 'REMOTE_OFFLINE' })
    await stopped
  })

  it('uses wall-clock heartbeat time when no clock adapter is supplied', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(456)
    const socket = new FakeSocket()
    const controller = new RemoteRelayEndpointController({
      endpoint: 'mobile',
      route: async () => ({
        routeId: parseRelayRouteId('route-one'),
        credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      }),
      attachmentId: () => parseRelayAttachmentId('mobile-one'),
      connect: async () => socket,
      heartbeatIntervalMs: 10,
      reconnectDelayMs: 1,
    })
    await controller.start()
    await vi.advanceTimersByTimeAsync(10)
    expect(socket.decoded()).toContainEqual({
      type: 'heartbeat', transportVersion: 1,
      attachmentId: parseRelayAttachmentId('mobile-one'), sentAt: 466,
    })
    await controller.stop()
    vi.useRealTimers()
  })
})

class FakeSocket implements RelayEndpointSocket {
  readonly sent: Uint8Array[] = []
  closed = false
  private readonly queue = new AsyncQueue<Uint8Array>()

  async send(value: Uint8Array): Promise<void> {
    if (this.closed) throw new Error('socket closed')
    this.sent.push(value)
  }

  messages(): AsyncIterable<Uint8Array> { return this.queue }

  receive(value: Uint8Array): void { this.queue.push(value) }

  async close(): Promise<void> { this.end() }

  end(): void {
    this.closed = true
    this.queue.end()
  }

  decoded() { return this.sent.map(value => decodeRelayMessage(value)) }
}

class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = []
  private readonly waits: Array<(value: IteratorResult<T>) => void> = []
  private ended = false

  push(value: T): void {
    const wait = this.waits.shift()
    if (wait === undefined) this.values.push(value)
    else wait({ done: false, value })
  }

  end(): void {
    this.ended = true
    for (const wait of this.waits.splice(0)) wait({ done: true, value: undefined })
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      const value = this.values.shift()
      if (value !== undefined) { yield value; continue }
      if (this.ended) return
      const next = await new Promise<IteratorResult<T>>((resolve) => { this.waits.push(resolve) })
      if (next.done) return
      yield next.value
    }
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject })
  return { promise, resolve, reject }
}
