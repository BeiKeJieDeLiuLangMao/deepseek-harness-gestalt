import {
  parseRelayAttachmentId,
  parseRelayRouteId,
  type RelayCiphertextMessage,
} from '@deepseek-ai/dsh-remote-protocol'
import { createClient } from 'redis'
import { describe, expect, it, vi } from 'vitest'
import {
  parseRelayConnectionToken,
  parseRelayDeliveryId,
  parseRelayInstanceId,
  type RelayCoordinationEvent,
  type RelayDirectoryEntry,
} from '../../remote-access/src/index.ts'
import {
  RedisRelayCoordinator,
  connectRedisRelayCoordinator,
  type RelayRedisClient,
} from '../src/index.ts'

vi.mock('redis', () => ({ createClient: vi.fn() }))

describe('RedisRelayCoordinator', () => {
  it('shares only expiring directory metadata, invalidations, and bounded ciphertext Pub/Sub', async () => {
    const bus = new FakeRedisBus()
    const platformA = new RedisRelayCoordinator({
      command: bus.client(), subscriber: bus.client(), keyPrefix: 'dsh:development:relay', clock: { now: () => 1_000 },
    })
    const platformB = new RedisRelayCoordinator({
      command: bus.client(), subscriber: bus.client(), keyPrefix: 'dsh:development:relay', clock: { now: () => 1_000 },
    })
    const routeId = parseRelayRouteId('route-one')
    const attachmentId = parseRelayAttachmentId('desktop-one')
    const entry: RelayDirectoryEntry = {
      routeId,
      attachmentId,
      endpoint: 'desktop',
      instanceId: parseRelayInstanceId('platform-b'),
      connectionToken: parseRelayConnectionToken('connection-one'),
      revision: 3,
      expiresAt: 31_000,
    }
    const received: RelayCoordinationEvent[] = []
    const stop = await platformB.listen(entry.instanceId, async (event) => { received.push(event) })
    await platformA.register(entry)

    expect(await platformA.locate(routeId, attachmentId)).toEqual(entry)
    expect(await platformA.refresh({ ...entry, expiresAt: 41_000 })).toBe(true)
    const ciphertext = Uint8Array.of(4, 8, 15, 16, 23, 42)
    const frame: RelayCiphertextMessage = {
      type: 'ciphertext', transportVersion: 1, routeId,
      sourceAttachmentId: parseRelayAttachmentId('mobile-one'), targetAttachmentId: attachmentId, ciphertext,
    }
    expect(await platformA.publish(entry.instanceId, {
      ...frame,
      sourceInstanceId: parseRelayInstanceId('platform-a'),
      targetConnectionToken: entry.connectionToken,
      deliveryId: parseRelayDeliveryId('delivery-one'),
      revision: entry.revision,
    })).toBe(true)
    expect(await platformA.publish(entry.instanceId, {
      type: 'delivered', deliveryId: parseRelayDeliveryId('delivery-one'),
    })).toBe(true)
    await platformA.invalidate({ type: 'invalidate', routeId, revision: 4 })

    expect(received).toEqual([
      expect.objectContaining({ type: 'ciphertext', ciphertext }),
      { type: 'delivered', deliveryId: parseRelayDeliveryId('delivery-one') },
      { type: 'invalidate', routeId, revision: 4 },
    ])
    expect(bus.published.join('\n')).not.toContain('private prompt')
    expect(bus.queuedMessages).toBe(0)
    await platformA.unregister({ ...entry, expiresAt: 41_000 })
    expect(await platformA.locate(routeId, attachmentId)).toBeUndefined()
    await stop()
  })

  it('does not retain ciphertext when the target instance has no subscriber', async () => {
    const bus = new FakeRedisBus()
    const coordinator = new RedisRelayCoordinator({
      command: bus.client(), subscriber: bus.client(), keyPrefix: 'dsh:production:relay', clock: { now: () => 1_000 },
    })
    const event = {
      type: 'ciphertext', transportVersion: 1,
      routeId: parseRelayRouteId('route-one'),
      sourceAttachmentId: parseRelayAttachmentId('mobile-one'),
      targetAttachmentId: parseRelayAttachmentId('desktop-one'),
      targetConnectionToken: parseRelayConnectionToken('connection-one'),
      sourceInstanceId: parseRelayInstanceId('platform-a'),
      deliveryId: parseRelayDeliveryId('delivery-one'),
      revision: 1,
      ciphertext: Uint8Array.of(1),
    } as const

    expect(await coordinator.publish(parseRelayInstanceId('platform-missing'), event)).toBe(false)
    expect(bus.queuedMessages).toBe(0)
  })

  it('validates namespaces, expiry, event kind, and default wall-clock TTL', async () => {
    const bus = new FakeRedisBus()
    for (const keyPrefix of ['', 'x'.repeat(129), 'not valid']) {
      expect(() => new RedisRelayCoordinator({
        command: bus.client(), subscriber: bus.client(), keyPrefix,
      })).toThrow('keyPrefix')
    }
    const coordinator = new RedisRelayCoordinator({
      command: bus.client(), subscriber: bus.client(), keyPrefix: 'dsh:relay',
    })
    const entry = directoryEntry(Date.now() + 1_000)
    await coordinator.register(entry)
    await expect(coordinator.register({ ...entry, expiresAt: Date.now() - 1 })).rejects.toThrow('future')
    await expect(coordinator.register({ ...entry, expiresAt: Date.now() + 1.5 })).rejects.toThrow('future')
    await expect(coordinator.publish(parseRelayInstanceId('platform-a'), {
      type: 'invalidate', routeId: entry.routeId, revision: 2,
    })).rejects.toThrow('must use invalidate')
  })

  it('rolls back partial subscription and aggregates unsubscribe failures', async () => {
    const command = clientFixture()
    const subscriber = clientFixture()
    subscriber.subscribe.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('subscribe failed'))
    const coordinator = new RedisRelayCoordinator({
      command, subscriber, keyPrefix: 'dsh:relay',
    })
    await expect(coordinator.listen(parseRelayInstanceId('platform-a'), async () => {}))
      .rejects.toThrow('subscribe failed')
    expect(subscriber.unsubscribe).toHaveBeenCalledOnce()

    subscriber.subscribe.mockReset().mockResolvedValue(undefined)
    subscriber.unsubscribe.mockReset().mockRejectedValue(new Error('unsubscribe failed'))
    const stop = await coordinator.listen(parseRelayInstanceId('platform-a'), async () => {})
    await expect(stop()).rejects.toThrow('subscription shutdown failed')
  })

  it('rejects malformed shared values and contains listener failures', async () => {
    const bus = new FakeRedisBus()
    const coordinator = new RedisRelayCoordinator({
      command: bus.client(), subscriber: bus.client(), keyPrefix: 'dsh:relay', clock: { now: () => 1_000 },
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stop = await coordinator.listen(parseRelayInstanceId('platform-a'), async () => {
      throw new Error('listener failed')
    })
    const malformedEvents = [
      'x'.repeat(140_000),
      'null',
      '[]',
      JSON.stringify({ type: 'invalidate', routeId: 'route-one', revision: 1, extra: true }),
      JSON.stringify({ type: 'invalidate', routeId: 'bad route', revision: 1 }),
      JSON.stringify({ type: 'invalidate', routeId: 'route-one', revision: 0 }),
      JSON.stringify({ type: 'unknown', targetConnectionToken: 'token', revision: 1, frame: '' }),
      JSON.stringify({ type: 'ciphertext', targetConnectionToken: 'token', revision: 1, frame: 1 }),
      JSON.stringify({ type: 'ciphertext', targetConnectionToken: 'token', revision: 1, frame: 'AA==' }),
      JSON.stringify({ type: 'ciphertext', targetConnectionToken: 'token', revision: 1, frame: 'A' }),
      JSON.stringify({ type: 'ciphertext', targetConnectionToken: 'token', revision: 1, frame: 'AB' }),
      JSON.stringify({
        type: 'ciphertext', targetConnectionToken: 'token', revision: 1,
        frame: Buffer.from(JSON.stringify({
          type: 'attach', transportVersion: 1, routeId: 'route-one', attachmentId: 'mobile-one',
          endpoint: 'mobile', credential: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        })).toString('base64url'),
      }),
    ]
    for (const event of malformedEvents) bus.emit('dsh:relay:instance:platform-a', event)
    await vi.waitFor(() => { expect(consoleError).toHaveBeenCalledTimes(malformedEvents.length) })

    await coordinator.invalidate({ type: 'invalidate', routeId: parseRelayRouteId('route-one'), revision: 2 })
    await vi.waitFor(() => { expect(consoleError).toHaveBeenCalledWith(
      '[remote-access-redis] coordination listener failed:', expect.any(Error),
    ) })

    const malformedDirectories = [
      'x'.repeat(2_049),
      'null',
      '[]',
      JSON.stringify({ ...directoryEntry(2_000), extra: true }),
      JSON.stringify({ ...directoryEntry(2_000), endpoint: 'relay' }),
      JSON.stringify({ ...directoryEntry(2_000), routeId: 'bad route' }),
      JSON.stringify({ ...directoryEntry(2_000), attachmentId: '' }),
      JSON.stringify({ ...directoryEntry(2_000), instanceId: '' }),
      JSON.stringify({ ...directoryEntry(2_000), connectionToken: '' }),
      JSON.stringify({ ...directoryEntry(2_000), revision: 0 }),
      JSON.stringify({ ...directoryEntry(2_000), expiresAt: 0 }),
    ]
    for (const value of malformedDirectories) {
      bus.raw('dsh:relay:directory:route-one:desktop-one', value)
      await expect(coordinator.locate(
        parseRelayRouteId('route-one'), parseRelayAttachmentId('desktop-one'),
      )).rejects.toThrow()
    }
    await stop()
    consoleError.mockRestore()
  })

  it('constructs and closes maintained Redis clients with fail-closed cleanup', async () => {
    await expect(connectRedisRelayCoordinator({ url: 'https://redis.example', keyPrefix: 'dsh:relay' }))
      .rejects.toThrow('redis or rediss')
    vi.mocked(createClient).mockClear()
    await expect(connectRedisRelayCoordinator({ url: 'redis://localhost:6379', keyPrefix: 'not valid' }))
      .rejects.toThrow('keyPrefix')
    expect(createClient).not.toHaveBeenCalled()

    const command = redisClientFixture()
    const subscriber = redisClientFixture()
    command.duplicate.mockReturnValue(subscriber)
    vi.mocked(createClient).mockReturnValue(command as never)
    const connected = await connectRedisRelayCoordinator({
      url: 'redis://localhost:6379', keyPrefix: 'dsh:relay',
    })
    expect(command.connect).toHaveBeenCalledOnce()
    expect(subscriber.connect).toHaveBeenCalledOnce()
    expect(command.on).toHaveBeenCalledBefore(command.connect)
    expect(subscriber.on).toHaveBeenCalledBefore(subscriber.connect)
    await connected.close()
    expect(command.quit).toHaveBeenCalledOnce()
    expect(subscriber.quit).toHaveBeenCalledOnce()
    expect(command.off).toHaveBeenCalledOnce()
    expect(subscriber.off).toHaveBeenCalledOnce()

    command.connect.mockReset().mockResolvedValue(undefined)
    subscriber.connect.mockReset().mockResolvedValue(undefined)
    command.quit.mockReset().mockRejectedValue(new Error('command quit failed'))
    subscriber.quit.mockReset().mockRejectedValue(new Error('subscriber quit failed'))
    const rediss = await connectRedisRelayCoordinator({
      url: 'rediss://localhost:6380', keyPrefix: 'dsh:relay',
    })
    await expect(rediss.close()).rejects.toThrow('clients failed to close')

    command.connect.mockReset().mockRejectedValue(new Error('connect failed'))
    subscriber.connect.mockReset().mockResolvedValue(undefined)
    command.close.mockReset().mockRejectedValue(new Error('already closed'))
    subscriber.close.mockReset().mockResolvedValue(undefined)
    await expect(connectRedisRelayCoordinator({
      url: 'redis://localhost:6379', keyPrefix: 'dsh:relay',
    })).rejects.toThrow('connect failed')
    expect(command.close).toHaveBeenCalled()
    expect(subscriber.close).toHaveBeenCalled()
  })
})

class FakeRedisBus {
  readonly published: string[] = []
  readonly queuedMessages = 0
  private readonly values = new Map<string, string>()
  private readonly subscriptions = new Map<string, Set<(message: string) => void>>()

  client(): RelayRedisClient {
    return {
      get: async key => this.values.get(key) ?? null,
      set: async (key, value) => { this.values.set(key, value); return 'OK' },
      eval: async (_script, options) => {
        const [key] = options.keys
        const value = key === undefined ? undefined : this.values.get(key)
        if (value === undefined) return 0
        const record = JSON.parse(value) as { connectionToken?: string }
        if (record.connectionToken !== options.arguments[0]) return 0
        const replacement = options.arguments[1]
        if (replacement === undefined) this.values.delete(key as string)
        else this.values.set(key as string, replacement)
        return 1
      },
      publish: async (channel, message) => {
        this.published.push(message)
        const listeners = [...(this.subscriptions.get(channel) ?? [])]
        for (const listener of listeners) listener(message)
        return listeners.length
      },
      subscribe: async (channel, listener) => {
        const listeners = this.subscriptions.get(channel) ?? new Set()
        listeners.add(listener)
        this.subscriptions.set(channel, listeners)
      },
      unsubscribe: async (channel, listener) => { this.subscriptions.get(channel)?.delete(listener) },
    }
  }

  emit(channel: string, message: string): void {
    for (const listener of this.subscriptions.get(channel) ?? []) listener(message)
  }

  raw(key: string, value: string): void { this.values.set(key, value) }
}

function directoryEntry(expiresAt: number): RelayDirectoryEntry {
  return {
    routeId: parseRelayRouteId('route-one'),
    attachmentId: parseRelayAttachmentId('desktop-one'),
    endpoint: 'desktop',
    instanceId: parseRelayInstanceId('platform-a'),
    connectionToken: parseRelayConnectionToken('connection-one'),
    revision: 1,
    expiresAt,
  }
}

function clientFixture() {
  return {
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    eval: vi.fn(async () => 1),
    publish: vi.fn(async () => 1),
    subscribe: vi.fn(async () => undefined),
    unsubscribe: vi.fn(async () => undefined),
  } satisfies Record<keyof RelayRedisClient, unknown> as unknown as {
    [K in keyof RelayRedisClient]: ReturnType<typeof vi.fn<RelayRedisClient[K]>>
  }
}

function redisClientFixture() {
  return {
    ...clientFixture(),
    duplicate: vi.fn(),
    connect: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    quit: vi.fn(async () => undefined),
    on: vi.fn(),
    off: vi.fn(),
  }
}
