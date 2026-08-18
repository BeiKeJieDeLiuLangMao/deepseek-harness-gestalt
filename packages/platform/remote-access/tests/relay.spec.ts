import { Context } from '@deepseek-ai/cordis'
import {
  parseRelayAttachmentId,
  parseRelayCredential,
  parseRelayRouteId,
  type RelayCiphertextMessage,
} from '@deepseek-ai/dsh-remote-protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RemoteRelayError,
  parseRelayConnectionToken,
  parseRelayDeliveryId,
  parseRelayInstanceId,
  type RelayCoordinationEvent,
  type RelayCoordinator,
  type RelayDirectoryEntry,
  type RelayRouteStore,
} from '../src/index.ts'
import { RemoteRelayProvider } from '../src/relay-provider.ts'

const CONFIG = {
  capacityRetryAfterMs: 1_000,
  deliveryAckTimeoutMs: 50,
  directoryTtlMs: 30_000,
  heartbeatTimeoutMs: 45_000,
  maxBufferedCiphertextBytes: 128 * 1024,
  maxConnections: 20,
  maxPendingDeliveries: 20,
} as const

afterEach(() => { vi.useRealTimers() })

describe('RemoteRelayProvider', () => {
  it('forwards bounded ciphertext when Mobile and Desktop attach to different instances', async () => {
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    const platformA = provider('platform-a', routeStore, coordinator, 11)
    const platformB = provider('platform-b', routeStore, coordinator, 29)
    const routeId = parseRelayRouteId('route-one')
    const grant = await platformA.rotateCredential(routeId)
    const mobileFrames: RelayCiphertextMessage[] = []
    const desktopFrames: RelayCiphertextMessage[] = []
    const mobile = await platformA.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('mobile-one'), endpoint: 'mobile', credential: grant.credential,
      },
      deliver: async (message) => { mobileFrames.push(message) },
    })
    await platformB.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-one'), endpoint: 'desktop', credential: grant.credential,
      },
      deliver: async (message) => { desktopFrames.push(message) },
    })
    const ciphertext = Uint8Array.of(5, 8, 13, 21)

    await mobile.receive({
      type: 'ciphertext', transportVersion: 1, routeId,
      sourceAttachmentId: parseRelayAttachmentId('mobile-one'),
      targetAttachmentId: parseRelayAttachmentId('desktop-one'),
      ciphertext,
    })

    expect(mobileFrames).toEqual([])
    expect(desktopFrames).toEqual([expect.objectContaining({ ciphertext })])
    expect(coordinator.events).toEqual([
      expect.objectContaining({ type: 'ciphertext', routeId, ciphertext }),
      expect.objectContaining({ type: 'delivered' }),
    ])
    await Promise.all([platformA.dispose(), platformB.dispose()])
  })

  it('rejects a route id without the current high-entropy credential', async () => {
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    const platform = provider('platform-a', routeStore, coordinator, 7)
    const routeId = parseRelayRouteId('route-one')
    await platform.rotateCredential(routeId)

    await expect(platform.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-one'), endpoint: 'desktop',
        credential: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as never,
      },
      deliver: async () => {},
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteRelayError>>({ code: 'RELAY_ATTACHMENT_REJECTED' }))
    await platform.dispose()
  })

  it('returns REMOTE_OFFLINE for a missing target without creating an offline queue', async () => {
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    const platform = provider('platform-a', routeStore, coordinator, 17)
    const routeId = parseRelayRouteId('route-one')
    const grant = await platform.rotateCredential(routeId)
    const mobile = await platform.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('mobile-one'), endpoint: 'mobile', credential: grant.credential,
      },
      deliver: async () => {},
    })

    await expect(mobile.receive({
      type: 'ciphertext', transportVersion: 1, routeId,
      sourceAttachmentId: parseRelayAttachmentId('mobile-one'),
      targetAttachmentId: parseRelayAttachmentId('desktop-missing'),
      ciphertext: Uint8Array.of(1),
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteRelayError>>({ code: 'REMOTE_OFFLINE' }))
    expect(coordinator.events).toEqual([])
    expect(coordinator.queuedEventCount).toBe(0)
    await platform.dispose()
  })

  it('disconnects a slow consumer instead of buffering beyond the configured ciphertext limit', async () => {
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    const platformA = provider('platform-a', routeStore, coordinator, 31)
    const platformB = new RemoteRelayProvider(new Context(), {
      instanceId: parseRelayInstanceId('platform-b'),
      routeStore,
      coordinator,
      config: { ...CONFIG, maxBufferedCiphertextBytes: 4 },
      randomBytes: size => new Uint8Array(size).fill(37),
    })
    const routeId = parseRelayRouteId('route-slow')
    const grant = await platformA.rotateCredential(routeId)
    const writer = deferred<undefined>()
    const mobile = await platformA.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('mobile-one'), endpoint: 'mobile', credential: grant.credential,
      },
      deliver: async () => {},
    })
    const desktop = await platformB.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-one'), endpoint: 'desktop', credential: grant.credential,
      },
      deliver: async () => { await writer.promise },
    })
    const first = mobile.receive(ciphertext(routeId, 'mobile-one', 'desktop-one', Uint8Array.of(1, 2, 3, 4)))
      .then(() => undefined, error => error as RemoteRelayError)
    await Promise.resolve()

    await expect(mobile.receive(ciphertext(routeId, 'mobile-one', 'desktop-one', Uint8Array.of(5))))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteRelayError>>({ code: 'REMOTE_OFFLINE' }))
    await expect(desktop.receive(ciphertext(routeId, 'desktop-one', 'mobile-one', Uint8Array.of(6))))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteRelayError>>({ code: 'REMOTE_OFFLINE' }))
    writer.resolve(undefined)
    expect(await first).toMatchObject({ code: 'REMOTE_OFFLINE' })
    await Promise.all([platformA.dispose(), platformB.dispose()])
  })

  it('rotates and revokes route authority across instances without interrupting unrelated routes', async () => {
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    let randomByte = 40
    const platformA = new RemoteRelayProvider(new Context(), {
      instanceId: parseRelayInstanceId('platform-a'), routeStore, coordinator, config: CONFIG,
      randomBytes: size => new Uint8Array(size).fill(++randomByte),
    })
    const platformB = provider('platform-b', routeStore, coordinator, 51)
    const routeId = parseRelayRouteId('route-rotated')
    const unrelatedRouteId = parseRelayRouteId('route-unrelated')
    const first = await platformA.rotateCredential(routeId)
    const unrelated = await platformA.rotateCredential(unrelatedRouteId)
    const oldDesktop = await platformB.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-old'), endpoint: 'desktop', credential: first.credential,
      },
      deliver: async () => {},
    })
    const unrelatedDesktop = await platformB.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId: unrelatedRouteId,
        attachmentId: parseRelayAttachmentId('desktop-unrelated'), endpoint: 'desktop', credential: unrelated.credential,
      },
      deliver: async () => {},
    })

    const rotated = await platformA.rotateCredential(routeId)
    expect(rotated.credential).not.toBe(first.credential)
    await expect(oldDesktop.receive(ciphertext(routeId, 'desktop-old', 'mobile-one', Uint8Array.of(1))))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteRelayError>>({ code: 'REMOTE_OFFLINE' }))
    await expect(platformB.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-rejected'), endpoint: 'desktop', credential: first.credential,
      },
      deliver: async () => {},
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteRelayError>>({ code: 'RELAY_ATTACHMENT_REJECTED' }))
    const currentDesktop = await platformB.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-current'), endpoint: 'desktop', credential: rotated.credential,
      },
      deliver: async () => {},
    })

    await platformA.revokeRoute(routeId)
    await expect(currentDesktop.receive(ciphertext(routeId, 'desktop-current', 'mobile-one', Uint8Array.of(2))))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteRelayError>>({ code: 'REMOTE_OFFLINE' }))
    await expect(unrelatedDesktop.receive(ciphertext(
      unrelatedRouteId, 'desktop-unrelated', 'mobile-missing', Uint8Array.of(3),
    ))).rejects.toEqual(expect.objectContaining<Partial<RemoteRelayError>>({ code: 'REMOTE_OFFLINE' }))
    await Promise.all([platformA.dispose(), platformB.dispose()])
  })

  it('sheds only new attachments at capacity and reports retry timing', async () => {
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    const platform = new RemoteRelayProvider(new Context(), {
      instanceId: parseRelayInstanceId('platform-a'), routeStore, coordinator,
      config: { ...CONFIG, maxConnections: 1 },
      randomBytes: size => new Uint8Array(size).fill(61),
    })
    const routeId = parseRelayRouteId('route-capacity')
    const grant = await platform.rotateCredential(routeId)
    const established = await platform.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-established'), endpoint: 'desktop', credential: grant.credential,
      },
      deliver: async () => {},
    })

    await expect(platform.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('mobile-new'), endpoint: 'mobile', credential: grant.credential,
      },
      deliver: async () => {},
    })).rejects.toEqual(expect.objectContaining<Partial<RemoteRelayError>>({
      code: 'PLATFORM_CAPACITY', retryAfterMs: CONFIG.capacityRetryAfterMs,
    }))
    await expect(established.receive(ciphertext(
      routeId, 'desktop-established', 'mobile-missing', Uint8Array.of(1),
    ))).rejects.toEqual(expect.objectContaining<Partial<RemoteRelayError>>({ code: 'REMOTE_OFFLINE' }))
    await platform.dispose()
  })

  it('reserves capacity before concurrent attachment authorization completes', async () => {
    const authorization = deferred<number | undefined>()
    const routeStore = new SharedRouteStore()
    const authorize = vi.spyOn(routeStore, 'authorize').mockImplementation(async () => await authorization.promise)
    const coordinator = new SharedCoordinator()
    const platform = new RemoteRelayProvider(new Context(), {
      instanceId: parseRelayInstanceId('platform-reservation'), routeStore, coordinator,
      config: { ...CONFIG, maxConnections: 1 },
      randomBytes: size => new Uint8Array(size).fill(63),
    })
    const credential = parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    const first = platform.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId: parseRelayRouteId('route-capacity'),
        attachmentId: parseRelayAttachmentId('desktop-one'), endpoint: 'desktop', credential,
      },
      deliver: async () => {},
    })
    await vi.waitFor(() => { expect(authorize).toHaveBeenCalledOnce() })

    const second = platform.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId: parseRelayRouteId('route-capacity'),
        attachmentId: parseRelayAttachmentId('mobile-one'), endpoint: 'mobile', credential,
      },
      deliver: async () => {},
    })
    await Promise.resolve()
    expect(authorize).toHaveBeenCalledOnce()

    authorization.resolve(1)
    await first
    await expect(second).rejects.toMatchObject({ code: 'PLATFORM_CAPACITY' })
    await platform.dispose()
  })

  it('quiesces an attachment registration before stopping coordination during disposal', async () => {
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    const entered = deferred<undefined>()
    const release = deferred<undefined>()
    const register = coordinator.register.bind(coordinator)
    vi.spyOn(coordinator, 'register').mockImplementation(async (entry) => {
      entered.resolve(undefined)
      await release.promise
      await register(entry)
    })
    const stopped = vi.fn()
    const listen = coordinator.listen.bind(coordinator)
    vi.spyOn(coordinator, 'listen').mockImplementation(async (instanceId, listener) => {
      const stop = await listen(instanceId, listener)
      return async () => { stopped(); await stop() }
    })
    const platform = provider('platform-quiescence', routeStore, coordinator, 65)
    const routeId = parseRelayRouteId('route-quiescence')
    const grant = await platform.rotateCredential(routeId)
    const attaching = platform.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-one'), endpoint: 'desktop', credential: grant.credential,
      },
      deliver: async () => {},
    })
    await entered.promise
    const disposing = platform.dispose()
    await new Promise<void>((resolve) => { setImmediate(resolve) })
    expect(stopped).not.toHaveBeenCalled()

    release.resolve(undefined)
    await expect(attaching).rejects.toMatchObject({ code: 'REMOTE_OFFLINE' })
    await disposing
    expect(stopped).toHaveBeenCalledOnce()
    expect(await coordinator.locate(routeId, parseRelayAttachmentId('desktop-one'))).toBeUndefined()
  })

  it('rejects an old authorization that is invalidated before attachment registration', async () => {
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    let randomByte = 70
    const platform = new RemoteRelayProvider(new Context(), {
      instanceId: parseRelayInstanceId('platform-authorization-race'),
      routeStore,
      coordinator,
      config: CONFIG,
      randomBytes: size => new Uint8Array(size).fill(++randomByte),
    })
    const routeId = parseRelayRouteId('route-authorization-race')
    const firstGrant = await platform.rotateCredential(routeId)
    const entered = deferred<undefined>()
    const release = deferred<undefined>()
    const authorize = routeStore.authorize.bind(routeStore)
    vi.spyOn(routeStore, 'authorize').mockImplementationOnce(async () => {
      entered.resolve(undefined)
      await release.promise
      return firstGrant.revision
    }).mockImplementation(authorize)
    const attaching = platform.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-one'), endpoint: 'desktop', credential: firstGrant.credential,
      },
      deliver: async () => {},
    })
    await entered.promise

    await platform.rotateCredential(routeId)
    release.resolve(undefined)

    await expect(attaching).rejects.toMatchObject({ code: 'RELAY_ATTACHMENT_REJECTED' })
    expect(await coordinator.locate(routeId, parseRelayAttachmentId('desktop-one'))).toBeUndefined()
    await platform.dispose()
  })

  it('requires a target delivery acknowledgement after asynchronous publication', async () => {
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    const platformA = provider('platform-ack-source', routeStore, coordinator, 72)
    const platformB = provider('platform-ack-target', routeStore, coordinator, 74)
    const routeId = parseRelayRouteId('route-stale-ack')
    const grant = await platformA.rotateCredential(routeId)
    const mobile = await platformA.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('mobile-one'), endpoint: 'mobile', credential: grant.credential,
      },
      deliver: async () => {},
    })
    coordinator.put({
      routeId,
      attachmentId: parseRelayAttachmentId('desktop-stale'),
      endpoint: 'desktop',
      instanceId: parseRelayInstanceId('platform-ack-target'),
      connectionToken: parseRelayConnectionToken('stale-connection'),
      revision: grant.revision,
      expiresAt: Date.now() + 10_000,
    })

    await expect(mobile.receive(ciphertext(
      routeId, 'mobile-one', 'desktop-stale', Uint8Array.of(1),
    ))).rejects.toMatchObject({ code: 'REMOTE_OFFLINE' })
    expect(coordinator.events).toContainEqual(expect.objectContaining({ type: 'ciphertext' }))
    expect(coordinator.events).not.toContainEqual(expect.objectContaining({ type: 'delivered' }))
    await Promise.all([platformA.dispose(), platformB.dispose()])
  })

  it('fails closed and detaches on heartbeat when shared route authority is uncertain', async () => {
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    const platform = provider('platform-a', routeStore, coordinator, 71)
    const routeId = parseRelayRouteId('route-heartbeat')
    const grant = await platform.rotateCredential(routeId)
    const desktop = await platform.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-one'), endpoint: 'desktop', credential: grant.credential,
      },
      deliver: async () => {},
    })
    routeStore.uncertain = true

    await expect(desktop.receive({
      type: 'heartbeat', transportVersion: 1,
      attachmentId: parseRelayAttachmentId('desktop-one'), sentAt: 1_787_027_200_000,
    } as never)).rejects.toEqual(expect.objectContaining<Partial<RemoteRelayError>>({ code: 'RELAY_ROUTE_REVOKED' }))
    await expect(desktop.receive(ciphertext(routeId, 'desktop-one', 'mobile-one', Uint8Array.of(1))))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteRelayError>>({ code: 'REMOTE_OFFLINE' }))
    await platform.dispose()
  })

  it('expires an attachment that stops heartbeating and removes its shared-directory presence', async () => {
    vi.useFakeTimers()
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    const platform = provider('platform-a', routeStore, coordinator, 73)
    const routeId = parseRelayRouteId('route-timeout')
    const grant = await platform.rotateCredential(routeId)
    const desktop = await platform.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-one'), endpoint: 'desktop', credential: grant.credential,
      },
      deliver: async () => {},
    })

    await vi.advanceTimersByTimeAsync(CONFIG.heartbeatTimeoutMs)

    await expect(desktop.receive(ciphertext(routeId, 'desktop-one', 'mobile-one', Uint8Array.of(1))))
      .rejects.toEqual(expect.objectContaining<Partial<RemoteRelayError>>({ code: 'REMOTE_OFFLINE' }))
    expect(await coordinator.locate(routeId, parseRelayAttachmentId('desktop-one'))).toBeUndefined()
    await platform.dispose()
  })

  it('observes every attachment and subscription failure during all-settled shutdown', async () => {
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    coordinator.failUnregister = true
    coordinator.failStop = true
    const platform = provider('platform-a', routeStore, coordinator, 79)
    const routeId = parseRelayRouteId('route-shutdown')
    const grant = await platform.rotateCredential(routeId)
    const closeCalls: string[] = []
    for (const attachmentId of ['mobile-one', 'desktop-one'] as const) {
      await platform.attach({
        message: {
          type: 'attach', transportVersion: 1, routeId,
          attachmentId: parseRelayAttachmentId(attachmentId),
          endpoint: attachmentId.startsWith('mobile') ? 'mobile' : 'desktop',
          credential: grant.credential,
        },
        deliver: async () => {},
        close: async () => {
          closeCalls.push(attachmentId)
          throw new Error(`${attachmentId} close failed`)
        },
      })
    }

    await expect(platform.dispose()).rejects.toMatchObject({
      errors: [expect.any(AggregateError), expect.any(AggregateError), expect.objectContaining({ message: 'stop failed' })],
    })
    expect(closeCalls).toEqual(['mobile-one', 'desktop-one'])
    expect(coordinator.unregisterCalls).toBe(2)
  })

  it('does not finish shutdown before an in-flight socket writer reaches quiescence', async () => {
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    const platform = provider('platform-a', routeStore, coordinator, 83)
    const routeId = parseRelayRouteId('route-drain')
    const grant = await platform.rotateCredential(routeId)
    const writer = deferred<undefined>()
    const mobile = await platform.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('mobile-one'), endpoint: 'mobile', credential: grant.credential,
      },
      deliver: async () => {},
    })
    await platform.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-one'), endpoint: 'desktop', credential: grant.credential,
      },
      deliver: async () => { await writer.promise },
    })
    const forwarding = mobile.receive(ciphertext(routeId, 'mobile-one', 'desktop-one', Uint8Array.of(1)))
      .then(() => undefined, error => error as RemoteRelayError)
    await Promise.resolve()
    let disposed = false
    const disposal = platform.dispose().then(() => { disposed = true })
    await new Promise<void>((resolve) => { setImmediate(resolve) })

    expect(disposed).toBe(false)
    writer.resolve(undefined)
    expect(await forwarding).toMatchObject({ code: 'REMOTE_OFFLINE' })
    await disposal
    expect(disposed).toBe(true)
  })

  it('fails closed across malformed configuration, entropy, ids, storage, and registration', async () => {
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => new RemoteRelayProvider(new Context(), {
        instanceId: parseRelayInstanceId('platform-a'),
        routeStore: new SharedRouteStore(), coordinator: new SharedCoordinator(),
        config: { ...CONFIG, maxConnections: value },
      })).toThrow('must be a positive integer')
    }
    for (const value of [undefined, '', 'x'.repeat(129), 'not valid']) {
      expect(() => parseRelayInstanceId(value)).toThrow('Relay instance id')
      expect(() => parseRelayConnectionToken(value)).toThrow('Relay connection token')
      expect(() => parseRelayDeliveryId(value)).toThrow('Relay delivery id')
    }
    expect(parseRelayConnectionToken('connection_valid-1')).toBe('connection_valid-1')
    expect(parseRelayDeliveryId('delivery_valid-1')).toBe('delivery_valid-1')

    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    const routeId = parseRelayRouteId('route-errors')
    const badCredentialEntropy = new RemoteRelayProvider(new Context(), {
      instanceId: parseRelayInstanceId('platform-a'), routeStore, coordinator, config: CONFIG,
      randomBytes: () => new Uint8Array(31),
    })
    await expect(badCredentialEntropy.rotateCredential(routeId)).rejects.toThrow('must return 32 bytes')
    await badCredentialEntropy.dispose()

    let call = 0
    const badTokenEntropy = new RemoteRelayProvider(new Context(), {
      instanceId: parseRelayInstanceId('platform-b'), routeStore, coordinator, config: CONFIG,
      randomBytes: size => new Uint8Array(call++ === 0 ? size : 15).fill(1),
    })
    const grant = await badTokenEntropy.rotateCredential(routeId)
    await expect(badTokenEntropy.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-one'), endpoint: 'desktop', credential: grant.credential,
      },
      deliver: async () => {},
    })).rejects.toThrow('must return 16 bytes')
    await badTokenEntropy.dispose()

    const defaults = new RemoteRelayProvider(new Context(), {
      instanceId: parseRelayInstanceId('platform-defaults'),
      routeStore: new SharedRouteStore(), coordinator: new SharedCoordinator(), config: CONFIG,
    })
    await defaults.rotateCredential(parseRelayRouteId('route-defaults'))
    await defaults.dispose()
    await defaults.dispose()
    await expect(defaults.rotateCredential(routeId)).rejects.toMatchObject({ code: 'REMOTE_OFFLINE' })
    await expect(defaults.revokeRoute(routeId)).rejects.toMatchObject({ code: 'REMOTE_OFFLINE' })

    routeStore.uncertain = true
    const unavailable = provider('platform-unavailable', routeStore, new SharedCoordinator(), 91)
    await expect(unavailable.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-two'), endpoint: 'desktop', credential: grant.credential,
      },
      deliver: async () => {},
    })).rejects.toMatchObject({ code: 'RELAY_ATTACHMENT_REJECTED' })
    await unavailable.dispose()

    routeStore.uncertain = false
    coordinator.failRegister = true
    const registration = provider('platform-registration', routeStore, coordinator, 93)
    await expect(registration.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-three'), endpoint: 'desktop', credential: grant.credential,
      },
      deliver: async () => {},
    })).rejects.toThrow('register failed')
    await registration.dispose()
  })

  it('rejects forged, stale, expired, and undeliverable live frames', async () => {
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    const clock = { value: 1_000 }
    const platform = new RemoteRelayProvider(new Context(), {
      instanceId: parseRelayInstanceId('platform-a'), routeStore, coordinator, config: CONFIG,
      randomBytes: size => new Uint8Array(size).fill(97), clock: { now: () => clock.value },
    })
    const routeId = parseRelayRouteId('route-forged')
    const grant = await platform.rotateCredential(routeId)
    const attachment = await platform.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('mobile-one'), endpoint: 'mobile', credential: grant.credential,
      },
      deliver: async () => {},
    })
    await expect(attachment.receive(ciphertext(
      parseRelayRouteId('route-other'), 'mobile-one', 'desktop-one', Uint8Array.of(1),
    ))).rejects.toMatchObject({ code: 'RELAY_ATTACHMENT_REJECTED' })
    await expect(attachment.receive(ciphertext(
      routeId, 'mobile-other', 'desktop-one', Uint8Array.of(1),
    ))).rejects.toMatchObject({ code: 'RELAY_ATTACHMENT_REJECTED' })

    coordinator.put({
      routeId, attachmentId: parseRelayAttachmentId('desktop-expired'), endpoint: 'desktop',
      instanceId: parseRelayInstanceId('platform-missing'), connectionToken: parseRelayConnectionToken('expired'),
      revision: grant.revision, expiresAt: 999,
    })
    await expect(attachment.receive(ciphertext(
      routeId, 'mobile-one', 'desktop-expired', Uint8Array.of(1),
    ))).rejects.toMatchObject({ code: 'REMOTE_OFFLINE' })
    coordinator.put({
      routeId, attachmentId: parseRelayAttachmentId('desktop-live'), endpoint: 'desktop',
      instanceId: parseRelayInstanceId('platform-missing'), connectionToken: parseRelayConnectionToken('live'),
      revision: grant.revision, expiresAt: 2_000,
    })
    await expect(attachment.receive(ciphertext(
      routeId, 'mobile-one', 'desktop-live', Uint8Array.of(1),
    ))).rejects.toMatchObject({ code: 'REMOTE_OFFLINE' })
    await expect(attachment.receive({
      type: 'heartbeat', transportVersion: 1,
      attachmentId: parseRelayAttachmentId('mobile-other'), sentAt: 1,
    })).rejects.toMatchObject({ code: 'RELAY_ATTACHMENT_REJECTED' })
    await platform.dispose()
    await expect(attachment.receive(ciphertext(
      routeId, 'mobile-one', 'desktop-live', Uint8Array.of(1),
    ))).rejects.toMatchObject({ code: 'REMOTE_OFFLINE' })
    await expect(attachment.receive({
      type: 'heartbeat', transportVersion: 1,
      attachmentId: parseRelayAttachmentId('mobile-one'), sentAt: 1,
    })).rejects.toMatchObject({ code: 'REMOTE_OFFLINE' })
  })

  it('refreshes current heartbeats and closes on changed authority or stale directory ownership', async () => {
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    const platform = provider('platform-a', routeStore, coordinator, 101)
    const routeId = parseRelayRouteId('route-heartbeats')
    const grant = await platform.rotateCredential(routeId)
    const message = {
      type: 'attach' as const, transportVersion: 1 as const, routeId,
      attachmentId: parseRelayAttachmentId('desktop-one'), endpoint: 'desktop' as const,
      credential: grant.credential,
    }
    const current = await platform.attach({ message, deliver: async () => {} })
    await current.receive({
      type: 'heartbeat', transportVersion: 1, attachmentId: message.attachmentId, sentAt: 1,
    })
    expect(coordinator.refreshCalls).toBe(1)
    coordinator.failRefresh = true
    await expect(current.receive({
      type: 'heartbeat', transportVersion: 1, attachmentId: message.attachmentId, sentAt: 2,
    })).rejects.toMatchObject({ code: 'REMOTE_OFFLINE' })

    coordinator.failRefresh = false
    const changed = await platform.attach({ message, deliver: async () => {} })
    await platform.rotateCredential(routeId)
    await expect(changed.receive({
      type: 'heartbeat', transportVersion: 1, attachmentId: message.attachmentId, sentAt: 3,
    })).rejects.toMatchObject({ code: 'REMOTE_OFFLINE' })
    await changed.close()
    await platform.dispose()
  })

  it('replaces duplicate attachments, ignores stale coordination, and closes failed writers', async () => {
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    const platformA = provider('platform-a', routeStore, coordinator, 103)
    const platformB = provider('platform-b', routeStore, coordinator, 107)
    const routeId = parseRelayRouteId('route-events')
    const grant = await platformA.rotateCredential(routeId)
    const close = vi.fn()
    const message = {
      type: 'attach' as const, transportVersion: 1 as const, routeId,
      attachmentId: parseRelayAttachmentId('desktop-one'), endpoint: 'desktop' as const,
      credential: grant.credential,
    }
    await platformB.attach({ message, deliver: async () => {}, close })
    const replacement = await platformB.attach({
      message,
      deliver: async () => { throw new Error('writer failed') },
    })
    expect(close).toHaveBeenCalledOnce()
    const mobile = await platformA.attach({
      message: {
        ...message, attachmentId: parseRelayAttachmentId('mobile-one'), endpoint: 'mobile',
      },
      deliver: async () => {},
    })
    await coordinator.send(parseRelayInstanceId('platform-b'), {
      ...ciphertext(routeId, 'mobile-one', 'missing', Uint8Array.of(1)),
      sourceInstanceId: parseRelayInstanceId('platform-a'),
      targetConnectionToken: parseRelayConnectionToken('missing-token'), revision: grant.revision,
      deliveryId: parseRelayDeliveryId('delivery-missing'),
    })
    const current = await coordinator.locate(routeId, message.attachmentId)
    if (current === undefined) throw new Error('replacement directory entry missing')
    for (const event of [
      { token: parseRelayConnectionToken('stale-token'), revision: current.revision },
      { token: current.connectionToken, revision: current.revision + 1 },
    ]) {
      await coordinator.send(current.instanceId, {
        ...ciphertext(routeId, 'mobile-one', 'desktop-one', Uint8Array.of(2)),
        sourceInstanceId: parseRelayInstanceId('platform-a'),
        targetConnectionToken: event.token, revision: event.revision,
        deliveryId: parseRelayDeliveryId(`delivery-${String(event.revision)}`),
      })
    }
    await expect(mobile.receive(ciphertext(
      routeId, 'mobile-one', 'desktop-one', Uint8Array.of(3),
    ))).rejects.toMatchObject({ code: 'REMOTE_OFFLINE' })
    await replacement.close()
    await Promise.all([platformA.dispose(), platformB.dispose()])
  })

  it('rejects silently changed route authority on the next heartbeat', async () => {
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    const platform = provider('platform-a', routeStore, coordinator, 109)
    const routeId = parseRelayRouteId('route-silent-change')
    const grant = await platform.rotateCredential(routeId)
    const desktop = await platform.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-one'), endpoint: 'desktop', credential: grant.credential,
      },
      deliver: async () => {},
    })
    routeStore.advanceRevision(routeId)

    await expect(desktop.receive({
      type: 'heartbeat', transportVersion: 1,
      attachmentId: parseRelayAttachmentId('desktop-one'), sentAt: 1,
    })).rejects.toMatchObject({ code: 'RELAY_ROUTE_REVOKED' })
    await platform.dispose()
  })

  it('surfaces invalidation cleanup failures and keeps replacement attachment cleanup token-safe', async () => {
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    const platform = provider('platform-a', routeStore, coordinator, 113)
    const routeId = parseRelayRouteId('route-invalidation-failure')
    const grant = await platform.rotateCredential(routeId)
    const first = await platform.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-one'), endpoint: 'desktop', credential: grant.credential,
      },
      deliver: async () => {},
    })
    const replacement = await platform.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-one'), endpoint: 'desktop', credential: grant.credential,
      },
      deliver: async () => {},
    })
    await first.close()
    expect(await coordinator.locate(routeId, parseRelayAttachmentId('desktop-one'))).toBeDefined()

    coordinator.failUnregister = true
    await expect(coordinator.invalidate({
      type: 'invalidate', routeId, revision: grant.revision + 1,
    })).rejects.toThrow('Relay invalidation cleanup failed')
    coordinator.failUnregister = false
    await expect(replacement.close()).rejects.toThrow('Relay attachment drain failed')
    await platform.dispose()
  })

  it('skips a queued delivery after its target closes and reports failed timeout cleanup', async () => {
    const routeStore = new SharedRouteStore()
    const coordinator = new SharedCoordinator()
    let timeout: (() => void) | undefined
    const platformA = provider('platform-a', routeStore, coordinator, 127)
    const platformB = new RemoteRelayProvider(new Context(), {
      instanceId: parseRelayInstanceId('platform-b'), routeStore, coordinator, config: CONFIG,
      randomBytes: size => new Uint8Array(size).fill(131),
      schedule: (task) => { timeout = task; return { unref: () => {} } as never },
    })
    const routeId = parseRelayRouteId('route-queued-close')
    const grant = await platformA.rotateCredential(routeId)
    const writer = deferred<undefined>()
    let deliveries = 0
    const mobile = await platformA.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('mobile-one'), endpoint: 'mobile', credential: grant.credential,
      },
      deliver: async () => {},
    })
    const desktop = await platformB.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-one'), endpoint: 'desktop', credential: grant.credential,
      },
      deliver: async () => { deliveries += 1; await writer.promise },
    })
    const first = mobile.receive(ciphertext(routeId, 'mobile-one', 'desktop-one', Uint8Array.of(1)))
      .then(() => undefined, error => error as RemoteRelayError)
    await vi.waitFor(() => { expect(deliveries).toBe(1) })
    const second = mobile.receive(ciphertext(routeId, 'mobile-one', 'desktop-one', Uint8Array.of(2)))
      .then(() => undefined, error => error as RemoteRelayError)
    await new Promise<void>((resolve) => { setImmediate(resolve) })
    const closing = desktop.close()
    writer.resolve(undefined)
    const [firstResult, secondResult] = await Promise.all([first, second, closing]).then(
      ([firstValue, secondValue]) => [firstValue, secondValue],
    )
    expect(firstResult).toMatchObject({ code: 'REMOTE_OFFLINE' })
    expect(secondResult).toMatchObject({ code: 'REMOTE_OFFLINE' })
    expect(deliveries).toBe(1)

    const timed = await platformB.attach({
      message: {
        type: 'attach', transportVersion: 1, routeId,
        attachmentId: parseRelayAttachmentId('desktop-timeout'), endpoint: 'desktop', credential: grant.credential,
      },
      deliver: async () => {},
    })
    coordinator.failUnregister = true
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    timeout?.()
    await vi.waitFor(() => { expect(consoleError).toHaveBeenCalledOnce() })
    coordinator.failUnregister = false
    await expect(timed.close()).rejects.toThrow('Relay attachment drain failed')
    consoleError.mockRestore()
    await Promise.all([platformA.dispose(), platformB.dispose()])
  })

  it('registers provider disposal as a Context effect', async () => {
    const ctx = new Context()
    let disposeEffect: (() => Promise<void>) | undefined
    vi.spyOn(ctx, 'effect').mockImplementation(((factory: () => () => Promise<void>) => {
      disposeEffect = factory()
      return () => {}
    }) as never)
    const platform = new RemoteRelayProvider(ctx, {
      instanceId: parseRelayInstanceId('platform-effect'),
      routeStore: new SharedRouteStore(), coordinator: new SharedCoordinator(), config: CONFIG,
      randomBytes: size => new Uint8Array(size).fill(137),
    })
    await disposeEffect?.()
    await expect(platform.rotateCredential(parseRelayRouteId('route-effect')))
      .rejects.toMatchObject({ code: 'REMOTE_OFFLINE' })
  })
})

function provider(
  id: string,
  routeStore: RelayRouteStore,
  coordinator: RelayCoordinator,
  randomByte: number,
): RemoteRelayProvider {
  return new RemoteRelayProvider(new Context(), {
    instanceId: parseRelayInstanceId(id),
    routeStore,
    coordinator,
    config: CONFIG,
    randomBytes: size => new Uint8Array(size).fill(randomByte),
  })
}

class SharedRouteStore implements RelayRouteStore {
  uncertain = false
  private readonly routes = new Map<string, { digest: string; revision: number; revoked: boolean }>()

  async rotate(routeId: string, credentialDigest: Uint8Array): Promise<number> {
    const current = this.routes.get(routeId)
    const revision = (current?.revision ?? 0) + 1
    this.routes.set(routeId, { digest: Buffer.from(credentialDigest).toString('hex'), revision, revoked: false })
    return revision
  }

  async authorize(routeId: string, credentialDigest: Uint8Array): Promise<number | undefined> {
    if (this.uncertain) throw new Error('shared route store unavailable')
    const current = this.routes.get(routeId)
    if (current === undefined || current.revoked
      || current.digest !== Buffer.from(credentialDigest).toString('hex')) return undefined
    return current.revision
  }

  async revoke(routeId: string): Promise<number> {
    const current = this.routes.get(routeId)
    const revision = (current?.revision ?? 0) + 1
    this.routes.set(routeId, { digest: '', revision, revoked: true })
    return revision
  }

  advanceRevision(routeId: string): void {
    const current = this.routes.get(routeId)
    if (current === undefined) throw new Error('route missing')
    this.routes.set(routeId, { ...current, revision: current.revision + 1 })
  }
}

class SharedCoordinator implements RelayCoordinator {
  readonly events: RelayCoordinationEvent[] = []
  readonly queuedEventCount = 0
  failStop = false
  failRegister = false
  failRefresh = false
  failUnregister = false
  refreshCalls = 0
  unregisterCalls = 0
  private readonly directory = new Map<string, RelayDirectoryEntry>()
  private readonly listeners = new Map<string, (event: RelayCoordinationEvent) => Promise<void>>()

  async listen(
    instanceId: string,
    listener: (event: RelayCoordinationEvent) => Promise<void>,
  ): Promise<() => Promise<void>> {
    this.listeners.set(instanceId, listener)
    return async () => {
      this.listeners.delete(instanceId)
      if (this.failStop) throw new Error('stop failed')
    }
  }

  async register(entry: RelayDirectoryEntry): Promise<void> {
    if (this.failRegister) throw new Error('register failed')
    this.directory.set(key(entry.routeId, entry.attachmentId), entry)
  }

  async refresh(entry: RelayDirectoryEntry): Promise<boolean> {
    this.refreshCalls += 1
    if (this.failRefresh) return false
    const current = this.directory.get(key(entry.routeId, entry.attachmentId))
    if (current?.connectionToken !== entry.connectionToken) return false
    this.directory.set(key(entry.routeId, entry.attachmentId), entry)
    return true
  }

  async unregister(entry: RelayDirectoryEntry): Promise<void> {
    this.unregisterCalls += 1
    const entryKey = key(entry.routeId, entry.attachmentId)
    if (this.directory.get(entryKey)?.connectionToken === entry.connectionToken) this.directory.delete(entryKey)
    if (this.failUnregister) throw new Error('unregister failed')
  }

  async locate(routeId: string, attachmentId: string): Promise<RelayDirectoryEntry | undefined> {
    return this.directory.get(key(routeId, attachmentId))
  }

  async publish(instanceId: string, event: RelayCoordinationEvent): Promise<boolean> {
    this.events.push(event)
    const listener = this.listeners.get(instanceId)
    if (listener === undefined) return false
    queueMicrotask(() => { void listener(event).catch(() => {}) })
    return true
  }

  async invalidate(event: Extract<RelayCoordinationEvent, { type: 'invalidate' }>): Promise<void> {
    await Promise.all([...this.listeners.values()].map(listener => listener(event)))
  }

  put(entry: RelayDirectoryEntry): void { this.directory.set(key(entry.routeId, entry.attachmentId), entry) }

  async send(instanceId: string, event: RelayCoordinationEvent): Promise<void> {
    await this.listeners.get(instanceId)?.(event)
  }
}

function key(routeId: string, attachmentId: string): string {
  return `${routeId}:${attachmentId}`
}

function ciphertext(
  routeId: ReturnType<typeof parseRelayRouteId>,
  sourceAttachmentId: string,
  targetAttachmentId: string,
  value: Uint8Array,
): RelayCiphertextMessage {
  return {
    type: 'ciphertext', transportVersion: 1, routeId,
    sourceAttachmentId: parseRelayAttachmentId(sourceAttachmentId),
    targetAttachmentId: parseRelayAttachmentId(targetAttachmentId),
    ciphertext: value,
  }
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => { resolve = settle })
  return { promise, resolve }
}
