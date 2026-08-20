import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { AccountProof } from '@deepseek-ai/dsh-platform-account'
import { parseAccountProofJti, parseInstallationId } from '@deepseek-ai/dsh-platform-account'
import {
  companionPushHintForEvent,
  parseCompanionPushToken,
  parseRelayCredential,
  parseRelayRouteId,
} from '@deepseek-ai/dsh-remote-protocol'
import {
  ApnsCompanionPushDelivery,
  CompanionPushDeliveryRouter,
  CompanionPushError,
  DesktopCompanionPushPublisher,
  FcmCompanionPushDelivery,
  KeylessCompanionPushDelivery,
  MemoryPersonalPairingAuthorityStore,
  MemoryPushTokenStore,
  PersonalPairingProvider,
  parsePairingCompletionId,
  parsePairingRendezvousId,
  parsePushTokenRegistration,
  publishCompanionPushHint,
  type NativePushTransport,
  type PairingHandshakeProvider,
  type PersonalPairingAuthorityStore,
} from '../src/index.ts'

const NOW = Date.parse('2026-08-19T10:00:00.000Z')
const routeId = parseRelayRouteId('keyless-no-relay')
const token = parseCompanionPushToken('device-token')

describe('Remote Access content-free push', () => {
  it('isolates tokens by Account and replaces the same token', async () => {
    const store = new MemoryPushTokenStore({ now: () => NOW })
    const first = parseInstallationId('mobile-one')
    const second = parseInstallationId('mobile-two')
    await store.put('account-one' as never, first, { routeId, platform: 'ios', token })
    await store.put('account-two' as never, second, {
      routeId, platform: 'android', token: parseCompanionPushToken('other-token'),
    })
    expect(await store.list('account-one' as never, routeId)).toEqual([{
      routeId, platform: 'ios', token, installationId: first, registeredAt: NOW,
    }])
    expect((await store.list('account-two' as never, routeId)).map(record => record.token))
      .toEqual(['other-token'])
    await store.put('account-one' as never, second, { routeId, platform: 'android', token })
    expect(await store.list('account-one' as never, routeId)).toEqual([{
      routeId, platform: 'android', token, installationId: second, registeredAt: NOW,
    }])
    expect(await store.list('account-two' as never, routeId)).toHaveLength(1)
  })

  it('removes one token, one Installation, or a whole route', async () => {
    const store = new MemoryPushTokenStore()
    const mobile = parseInstallationId('mobile-one')
    const other = parseInstallationId('mobile-two')
    await store.put('account-one' as never, mobile, { routeId, platform: 'ios', token })
    await store.put('account-one' as never, other, {
      routeId, platform: 'android', token: parseCompanionPushToken('second-token'),
    })
    await store.remove('account-one' as never, routeId, token)
    expect((await store.list('account-one' as never, routeId)).map(record => record.token))
      .toEqual(['second-token'])
    await store.put('account-one' as never, mobile, { routeId, platform: 'ios', token })
    await store.removeInstallation('account-one' as never, routeId, mobile)
    expect((await store.list('account-one' as never, routeId)).map(record => record.installationId))
      .toEqual([other])
    await store.removeRoute('account-one' as never, routeId)
    expect(await store.list('account-one' as never, routeId)).toEqual([])
    await store.put('account-one' as never, mobile, { routeId, platform: 'ios', token })
    await store.removeInstallationTokens('account-one' as never, mobile)
    expect(await store.list('account-one' as never, routeId)).toEqual([])
  })

  it('projects APNs and FCM payloads through injected transports without Session content', async () => {
    const sent: Array<{ platform: string; payload: unknown }> = []
    const transport: NativePushTransport = {
      send: async (request) => {
        sent.push({ platform: request.platform, payload: request.payload })
        return 'delivered'
      },
    }
    const hint = companionPushHintForEvent({
      kind: 'approval', routeId, sessionRef: 'session-one',
    })
    if (hint === undefined) throw new Error('expected approval hint')
    await new ApnsCompanionPushDelivery(transport).deliver(
      { routeId, platform: 'ios', token },
      hint,
    )
    await new FcmCompanionPushDelivery(transport).deliver(
      { routeId, platform: 'android', token },
      hint,
    )
    expect(sent).toEqual([
      {
        platform: 'ios',
        payload: {
          aps: { alert: { title: 'Approval requested' }, category: 'approval', 'thread-id': routeId },
          routeId,
          sessionRef: 'session-one',
        },
      },
      {
        platform: 'android',
        payload: {
          message: {
            token,
            notification: { title: 'Approval requested' },
            data: { category: 'approval', routeId, sessionRef: 'session-one' },
          },
        },
      },
    ])
    expect(() => new ApnsCompanionPushDelivery(transport).deliver(
      { routeId, platform: 'android', token },
      hint,
    )).toThrow(CompanionPushError)
    expect(() => new FcmCompanionPushDelivery(transport).deliver(
      { routeId, platform: 'ios', token },
      hint,
    )).toThrow(CompanionPushError)
  })

  it('routes by platform and fails loud when a platform adapter is missing', async () => {
    expect(() => new CompanionPushDeliveryRouter({})).toThrow(CompanionPushError)
    const ios = new KeylessCompanionPushDelivery()
    const router = new CompanionPushDeliveryRouter({ ios })
    const hint = companionPushHintForEvent({ kind: 'question', routeId })
    if (hint === undefined) throw new Error('expected question hint')
    await expect(router.deliver({ routeId, platform: 'ios', token }, hint)).resolves.toBe('delivered')
    await expect(router.deliver({ routeId, platform: 'android', token }, hint))
      .rejects.toMatchObject({ code: 'PUSH_PROVIDER_UNAVAILABLE' })
    expect(ios.outbox).toEqual([{ target: { routeId, platform: 'ios', token }, hint }])
  })

  it('fans out exact hints, prunes dead tokens, and surfaces delivery failure', async () => {
    const store = new MemoryPushTokenStore()
    const live = parseCompanionPushToken('live-token')
    const dead = parseCompanionPushToken('dead-token')
    await store.put('account-one' as never, parseInstallationId('mobile-one'), {
      routeId, platform: 'ios', token: live,
    })
    await store.put('account-one' as never, parseInstallationId('mobile-two'), {
      routeId, platform: 'android', token: dead,
    })
    const hint = companionPushHintForEvent({ kind: 'turn-complete', routeId })
    if (hint === undefined) throw new Error('expected turn-complete hint')
    const delivery = {
      deliver: vi.fn(async (target: { token: string }, receivedHint: typeof hint) => {
        expect(receivedHint).toEqual(hint)
        return target.token === dead ? 'unregistered' as const : 'delivered' as const
      }),
    }
    expect(await publishCompanionPushHint(store, delivery, 'account-one' as never, hint))
      .toEqual({ delivered: 1, pruned: 1 })
    expect(delivery.deliver.mock.calls.map(([target]) => target.token)).toEqual([live, dead])
    expect((await store.list('account-one' as never, routeId)).map(record => record.token)).toEqual([live])
    await expect(publishCompanionPushHint(store, {
      deliver: async () => {
        throw new Error('vendor timeout')
      },
    }, 'account-one' as never, hint)).rejects.toMatchObject({ code: 'PUSH_DELIVERY_FAILED' })
  })

  it('never publishes a streaming event and publishes the four generic categories after pairing', async () => {
    const { provider, delivery } = pushProvider()
    const desktop = authentication('desktop-installation')
    const mobile = authentication('mobile-installation')
    await pair(provider, desktop, mobile)
    expect(companionPushHintForEvent({ kind: 'streaming', routeId })).toBeUndefined()
    await provider.registerPushToken({
      mobile,
      registration: { routeId, platform: 'ios', token },
    })
    for (const kind of ['approval', 'question', 'turn-complete', 'failure'] as const) {
      const hint = companionPushHintForEvent({ kind, routeId, sessionRef: 'session-one' })
      if (hint === undefined) throw new Error(`expected ${kind} hint`)
      expect(await provider.publishPushHint({ desktop, hint })).toEqual({ delivered: 1, pruned: 0 })
    }
    expect(delivery.outbox.map(record => record.hint.category))
      .toEqual(['approval', 'question', 'turn-complete', 'failure'])
    expect(delivery.outbox.every(record => record.hint.routeId === routeId)).toBe(true)
    expect(JSON.stringify(delivery.outbox)).not.toContain('session content')
  })

  it('deletes the matching token on unpair, individual revoke, and Mobile Access disable', async () => {
    const { provider, store } = pushProvider()
    const desktop = authentication('desktop-installation')
    const mobile = authentication('mobile-installation')
    const pairing = await pair(provider, desktop, mobile)
    await provider.registerPushToken({
      mobile,
      registration: { routeId, platform: 'ios', token },
    })
    expect(await store.list('account-one' as never, routeId)).toHaveLength(1)
    await provider.unregisterPushToken({ mobile, routeId, token })
    expect(await store.list('account-one' as never, routeId)).toEqual([])
    await provider.registerPushToken({
      mobile,
      registration: { routeId, platform: 'ios', token },
    })
    await provider.revokePersonalPairing({ desktop, pairingId: pairing.id })
    expect(await store.list('account-one' as never, routeId)).toEqual([])
    const second = pushProvider()
    const secondPairing = await pair(second.provider, desktop, mobile, 'disable')
    await second.provider.registerPushToken({
      mobile,
      registration: { routeId, platform: 'android', token: parseCompanionPushToken('disable-token') },
    })
    await second.provider.setMobileAccess({ desktop, enabled: false })
    expect(await second.store.list('account-one' as never, routeId)).toEqual([])
    expect(secondPairing.id).toBeDefined()

    const withRelay = relayPushProvider()
    const relayDesktop = authentication('desktop-installation')
    const relayMobile = authentication('mobile-installation')
    await pair(withRelay.provider, relayDesktop, relayMobile, 'relay-disable')
    await withRelay.provider.registerPushToken({
      mobile: relayMobile,
      registration: { routeId: withRelay.routeId, platform: 'ios', token },
    })
    await withRelay.provider.setMobileAccess({ desktop: relayDesktop, enabled: false })
    expect(await withRelay.store.list('account-one' as never, withRelay.routeId)).toEqual([])
    expect(withRelay.relay.revokeRoute).toHaveBeenCalled()
  })

  it('skips another confirmed pairing when one Mobile registers or unregisters a token', async () => {
    const { provider, store } = pushProvider()
    const desktop = authentication('desktop-installation')
    const firstMobile = authentication('mobile-first')
    const secondMobile = authentication('mobile-second')
    await pair(provider, desktop, firstMobile, 'first-route-owner')
    await pair(provider, desktop, secondMobile, 'second-route-owner')
    await provider.registerPushToken({
      mobile: secondMobile,
      registration: { routeId, platform: 'ios', token },
    })
    expect(await store.list('account-one' as never, routeId)).toEqual([{
      routeId, platform: 'ios', token,
      installationId: parseInstallationId('mobile-second'),
      registeredAt: NOW,
    }])
    await provider.unregisterPushToken({ mobile: secondMobile, routeId, token })
    expect(await store.list('account-one' as never, routeId)).toEqual([])
  })

  it('rejects uncomposed push, unpaired routes, and the wrong Installation kind', async () => {
    const bare = uniquePairingProvider(handshakeProvider())
    const desktop = authentication('desktop-installation')
    const mobile = authentication('mobile-installation')
    await expect(bare.registerPushToken({
      mobile,
      registration: { routeId, platform: 'ios', token },
    })).rejects.toThrow('Remote Access push is not composed')
    const { provider } = pushProvider()
    await expect(provider.registerPushToken({
      mobile,
      registration: { routeId, platform: 'ios', token },
    })).rejects.toMatchObject({ code: 'PAIRING_PENDING_INVALID' })
    await pair(provider, desktop, mobile)
    await expect(provider.registerPushToken({
      mobile: desktop,
      registration: { routeId, platform: 'ios', token },
    })).rejects.toMatchObject({ code: 'PAIRING_INSTALLATION_KIND_INVALID' })
    await expect(provider.publishPushHint({
      desktop: mobile,
      hint: { category: 'failure', routeId },
    })).rejects.toMatchObject({ code: 'PAIRING_INSTALLATION_KIND_INVALID' })
    await expect(provider.publishPushHint({
      desktop,
      hint: { category: 'failure', routeId: parseRelayRouteId('other-route') },
    })).rejects.toMatchObject({ code: 'MOBILE_ACCESS_DISABLED' })
    await expect(provider.unregisterPushToken({
      mobile,
      routeId: parseRelayRouteId('other-route'),
      token,
    })).rejects.toMatchObject({ code: 'PAIRING_PENDING_INVALID' })
    const otherMobile = authentication('mobile-other')
    await pair(provider, desktop, otherMobile, 'second-mobile')
    await provider.registerPushToken({
      mobile,
      registration: { routeId, platform: 'ios', token },
    })
    expect(await provider.publishPushHint({
      desktop,
      hint: { category: 'failure', routeId },
    })).toEqual({ delivered: 1, pruned: 0 })
  })

  it('rejects an extra-field hint at the provider entry before outbox or vendor delivery', async () => {
    const { provider, delivery } = pushProvider()
    const desktop = authentication('desktop-installation')
    const mobile = authentication('mobile-installation')
    await pair(provider, desktop, mobile, 'allowlist')
    await provider.registerPushToken({
      mobile,
      registration: { routeId, platform: 'ios', token },
    })
    const sent: unknown[] = []
    const vendor = new ApnsCompanionPushDelivery({
      send: async (request) => {
        sent.push(request.payload)
        return 'delivered'
      },
    })
    const vendorProvider = uniquePairingProvider(handshakeProvider(), {
      store: new MemoryPushTokenStore({ now: () => NOW }),
      delivery: vendor,
    })
    await pair(vendorProvider, desktop, mobile, 'vendor-allowlist')
    await vendorProvider.registerPushToken({
      mobile,
      registration: { routeId, platform: 'ios', token },
    })
    const smuggled = { category: 'approval', routeId, text: 'secret session content' }
    await expect(provider.publishPushHint({ desktop, hint: smuggled as never }))
      .rejects.toThrow('unsupported fields')
    await expect(vendorProvider.publishPushHint({ desktop, hint: smuggled as never }))
      .rejects.toThrow('unsupported fields')
    expect(delivery.outbox).toEqual([])
    expect(sent).toEqual([])
  })

  it('rejects a non-object, extra-field, or unsupported-platform registration at the executor', () => {
    expect(() => parsePushTokenRegistration(null)).toThrow('Push token registration must be an object')
    expect(() => parsePushTokenRegistration([{ routeId, platform: 'ios', token }]))
      .toThrow('Push token registration must be an object')
    expect(() => parsePushTokenRegistration({
      routeId, platform: 'ios', token, text: 'secret',
    })).toThrow('unsupported fields')
    expect(() => parsePushTokenRegistration({ routeId, platform: 'web', token }))
      .toThrow('Push token platform is unsupported')
    expect(parsePushTokenRegistration({ routeId, platform: 'android', token }))
      .toEqual({ routeId, platform: 'android', token })
  })

  it('publishes hints only after a durable pending commit and never for streaming', async () => {
    const { provider, delivery } = pushProvider()
    const desktop = authentication('desktop-installation')
    const mobile = authentication('mobile-installation')
    await pair(provider, desktop, mobile, 'commit')
    await provider.registerPushToken({
      mobile,
      registration: { routeId, platform: 'ios', token },
    })
    const publisher = new DesktopCompanionPushPublisher(hint => provider.publishPushHint({ desktop, hint }))
    expect(delivery.outbox).toEqual([])
    expect(await publisher.handle({ kind: 'approval', routeId, committed: false })).toBeUndefined()
    expect(delivery.outbox).toEqual([])
    expect(await publisher.handle({ kind: 'streaming', routeId, committed: true })).toBeUndefined()
    expect(delivery.outbox).toEqual([])
    expect(await publisher.handle({
      kind: 'approval', routeId, committed: true, sessionRef: 'session-one',
    })).toEqual({ delivered: 1, pruned: 0 })
    expect(delivery.outbox.map(record => record.hint)).toEqual([
      { category: 'approval', routeId, sessionRef: 'session-one' },
    ])
  })

  it('deletes tokens on revoke even when the Desktop route is already gone', async () => {
    const authority = new MemoryPersonalPairingAuthorityStore()
    const store = new MemoryPushTokenStore()
    const delivery = new KeylessCompanionPushDelivery()
    const provider = uniquePairingProvider(handshakeProvider(), { store, delivery }, authority)
    const desktop = authentication('desktop-installation')
    const mobile = authentication('mobile-installation')
    const pairing = await pair(provider, desktop, mobile, 'stale-route')
    await provider.registerPushToken({
      mobile,
      registration: { routeId, platform: 'ios', token },
    })
    await authority.disableDesktop('account-one' as never, parseInstallationId('desktop-installation'))
    await provider.revokePersonalPairing({ desktop, pairingId: pairing.id })
    expect(await store.list('account-one' as never, routeId)).toEqual([])
  })
})

function pushProvider() {
  const store = new MemoryPushTokenStore({ now: () => NOW })
  const delivery = new KeylessCompanionPushDelivery()
  return {
    store,
    delivery,
    provider: uniquePairingProvider(handshakeProvider(), { store, delivery }),
  }
}

async function pair(
  provider: PersonalPairingProvider,
  desktop: ReturnType<typeof authentication>,
  mobile: ReturnType<typeof authentication>,
  label = 'push',
) {
  await provider.setMobileAccess({ desktop, enabled: true })
  const challenge = await provider.createChallenge({
    desktop,
    rendezvousId: parsePairingRendezvousId(`${label}-rendezvous`),
    clientIp: '192.0.2.1',
  })
  const pending = await provider.completeChallenge({
    mobile,
    completionId: parsePairingCompletionId(`${label}-completion`),
    oneTimeLink: challenge.oneTimeLink,
    device: { name: 'Alice phone', platform: 'ios' },
    mobileHandshake: Uint8Array.of(9),
  })
  return provider.confirmPairing({ desktop, pendingPairingId: pending.pendingPairingId })
}

function uniquePairingProvider(
  handshake: PairingHandshakeProvider,
  push?: { store: MemoryPushTokenStore; delivery: KeylessCompanionPushDelivery | ApnsCompanionPushDelivery },
  authority?: PersonalPairingAuthorityStore,
) {
  let id = 0
  return new PersonalPairingProvider(new Context(), {
    account: {
      currentInstallation: vi.fn(async ({ accessToken }: { accessToken: string }) => authenticated(accessToken)),
    },
    handshake,
    clock: { now: () => NOW },
    randomBytes: size => Uint8Array.from({ length: size }, (_, index) => index),
    randomId: kind => `${kind}-${String(++id)}`,
    pairingLinkOrigin: 'https://platform.example.com/pair',
    ...(authority === undefined ? {} : { authority }),
    ...(push === undefined ? {} : { push }),
  })
}

function relayPushProvider() {
  const store = new MemoryPushTokenStore({ now: () => NOW })
  const delivery = new KeylessCompanionPushDelivery()
  const authority = new MemoryPersonalPairingAuthorityStore()
  const relayRouteId = parseRelayRouteId('relay-route')
  const relay = {
    rotateCredential: vi.fn(async () => ({
      routeId: relayRouteId,
      endpoint: 'desktop' as const,
      credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      revision: 1,
    })),
    issueCredential: vi.fn(async () => ({
      routeId: relayRouteId,
      endpoint: 'mobile' as const,
      credential: parseRelayCredential('AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE'),
      revision: 1,
    })),
    revokeCredential: vi.fn(async () => {}),
    revokeRoute: vi.fn(async () => {}),
  }
  const handshake = {
    ...handshakeProvider(),
    sealMobileRelayAuthority: vi.fn(async () => Uint8Array.of(1)),
  }
  let id = 0
  return {
    store,
    delivery,
    relay,
    routeId: relayRouteId,
    provider: new PersonalPairingProvider(new Context(), {
      account: {
        currentInstallation: vi.fn(async ({ accessToken }: { accessToken: string }) => authenticated(accessToken)),
      },
      handshake,
      relay,
      authority,
      push: { store, delivery },
      clock: { now: () => NOW },
      randomBytes: size => Uint8Array.from({ length: size }, (_, index) => index),
      randomId: kind => kind === 'relay-route' ? relayRouteId : `${kind}-${String(++id)}`,
      pairingLinkOrigin: 'https://platform.example.com/pair',
    }),
  }
}

function handshakeProvider(): PairingHandshakeProvider {
  let key = 0
  return {
    createChallenge: vi.fn().mockResolvedValue({
      desktopFingerprint: 'desktop-fingerprint',
      state: Uint8Array.of(1),
    }),
    completeChallenge: vi.fn().mockResolvedValue({
      handshakeHash: Uint8Array.from({ length: 32 }, (_, index) => index),
      desktopHandshake: Uint8Array.of(8),
      pendingPairingKey: Uint8Array.of(7),
    }),
    activatePairing: vi.fn().mockImplementation(async () => ({
      keyReference: `pairing-key-${String(++key)}`,
      activePairingKey: Uint8Array.of(key),
    })),
    destroyChallenge: vi.fn(),
    destroyPendingPairing: vi.fn(),
    destroyPairing: vi.fn(),
  }
}

function authentication(installationId: string, accountId = 'account-one') {
  const proof: AccountProof = {
    jti: parseAccountProofJti(`${installationId}-proof`),
    issuedAt: NOW,
    signature: 'signature',
  }
  return { accessToken: `${accountId}:${installationId}-token`, proof }
}

function authenticated(accessToken: string) {
  const [accountId, installationToken] = accessToken.split(':') as [string, string]
  const installationId = installationToken.replace(/-token$/u, '')
  return {
    account: {
      id: accountId as never,
      githubId: 1,
      githubLogin: accountId,
      avatarUrl: 'https://avatars.example/account',
    },
    installation: {
      id: parseInstallationId(installationId),
      kind: installationId.includes('mobile') ? 'mobile' as const : 'desktop' as const,
    },
  }
}
