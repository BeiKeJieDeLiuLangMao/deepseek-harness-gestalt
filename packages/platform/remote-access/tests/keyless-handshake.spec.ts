import { describe, expect, it } from 'vitest'
import { parseRelayCredential, parseRelayRouteId } from '@deepseek-ai/dsh-remote-protocol'
import {
  DevelopmentKeylessPairingHandshakeProvider,
  deriveKeylessDesktopFingerprint,
  deriveKeylessHandshakeHash,
  deriveKeylessMobileHandshake,
  deriveKeylessPairingKey,
} from '../src/keyless-handshake.ts'

const SECRET = Uint8Array.from({ length: 32 }, (_, index) => index)
const OTHER_SECRET = Uint8Array.from({ length: 32 }, (_, index) => 255 - index)

describe('keyless derivation helpers', () => {
  it('derives deterministic 256-bit values from the invitation secret', async () => {
    expect(await deriveKeylessPairingKey(SECRET)).toEqual(await deriveKeylessPairingKey(SECRET))
    expect(await deriveKeylessPairingKey(SECRET)).not.toEqual(await deriveKeylessPairingKey(OTHER_SECRET))
    expect((await deriveKeylessPairingKey(SECRET)).byteLength).toBe(32)
    expect((await deriveKeylessMobileHandshake(SECRET)).byteLength).toBe(32)
    expect((await deriveKeylessHandshakeHash(SECRET, Uint8Array.of(9))).byteLength).toBe(32)
    expect(await deriveKeylessHandshakeHash(SECRET, Uint8Array.of(9)))
      .not.toEqual(await deriveKeylessHandshakeHash(SECRET, Uint8Array.of(8)))
    expect(await deriveKeylessDesktopFingerprint(SECRET)).toMatch(/^keyless-[0-9a-f]{16}$/u)
    expect(await deriveKeylessDesktopFingerprint(SECRET)).toBe(await deriveKeylessDesktopFingerprint(SECRET))
    expect(await deriveKeylessDesktopFingerprint(SECRET)).not.toBe(await deriveKeylessDesktopFingerprint(OTHER_SECRET))
  })

  it('separates derivation domains', async () => {
    const pairingKey = await deriveKeylessPairingKey(SECRET)
    expect(await deriveKeylessMobileHandshake(SECRET)).not.toEqual(pairingKey)
    expect(await deriveKeylessHandshakeHash(SECRET, Uint8Array.of(0))).not.toEqual(pairingKey)
  })
})

describe('DevelopmentKeylessPairingHandshakeProvider', () => {
  it('carries the invitation secret through the challenge state', async () => {
    const provider = new DevelopmentKeylessPairingHandshakeProvider()
    const challenge = await provider.createChallenge({ invitationSecret: SECRET, expiresAt: 1 })
    expect(challenge.desktopFingerprint).toBe(await deriveKeylessDesktopFingerprint(SECRET))
    expect(challenge.state).toEqual(SECRET)
    expect(challenge.state).not.toBe(SECRET)
  })

  it('rejects a non-256-bit invitation secret at every entry', async () => {
    const provider = new DevelopmentKeylessPairingHandshakeProvider()
    await expect(provider.createChallenge({ invitationSecret: Uint8Array.of(1), expiresAt: 1 }))
      .rejects.toThrow('256 bits')
    await expect(provider.completeChallenge({
      invitationSecret: Uint8Array.of(1), challengeState: Uint8Array.of(1), mobileHandshake: Uint8Array.of(0),
    })).rejects.toThrow('256 bits')
    await expect(provider.activatePairing({ pendingPairingKey: Uint8Array.of(1) })).rejects.toThrow('256 bits')
    expect(() => provider.exportPairingKeyMaterial(Uint8Array.of(1))).toThrow('256 bits')
  })

  it('completes only when the challenge state matches the invitation', async () => {
    const provider = new DevelopmentKeylessPairingHandshakeProvider()
    const challenge = await provider.createChallenge({ invitationSecret: SECRET, expiresAt: 1 })
    await expect(provider.completeChallenge({
      invitationSecret: OTHER_SECRET, challengeState: challenge.state, mobileHandshake: Uint8Array.of(0),
    })).rejects.toThrow('does not match')
    const mismatched = await provider.createChallenge({ invitationSecret: OTHER_SECRET, expiresAt: 1 })
    mismatched.state[0] = (mismatched.state[0] as number) ^ 1
    await expect(provider.completeChallenge({
      invitationSecret: OTHER_SECRET, challengeState: mismatched.state, mobileHandshake: Uint8Array.of(0),
    })).rejects.toThrow('does not match')
    await expect(provider.completeChallenge({
      invitationSecret: SECRET, challengeState: Uint8Array.of(1), mobileHandshake: Uint8Array.of(0),
    })).rejects.toThrow('does not match')
  })

  it('hands both peers the same 256-bit pairing key and a distinct active allocation', async () => {
    const provider = new DevelopmentKeylessPairingHandshakeProvider()
    const challenge = await provider.createChallenge({ invitationSecret: SECRET, expiresAt: 1 })
    const completed = await provider.completeChallenge({
      invitationSecret: SECRET,
      challengeState: challenge.state,
      mobileHandshake: await deriveKeylessMobileHandshake(SECRET),
    })
    const pairingKey = await deriveKeylessPairingKey(SECRET)
    expect(completed.desktopHandshake).toEqual(pairingKey)
    expect(completed.pendingPairingKey).toEqual(pairingKey)
    expect(completed.handshakeHash).toEqual(await deriveKeylessHandshakeHash(SECRET, await deriveKeylessMobileHandshake(SECRET)))
    expect(completed.handshakeHash.byteLength).toBeGreaterThanOrEqual(32)

    const activation = await provider.activatePairing({ pendingPairingKey: completed.pendingPairingKey })
    expect(activation.keyReference).toMatch(/^keyless-[0-9a-f]{16}$/u)
    expect(activation.activePairingKey).toEqual(pairingKey)
    expect(activation.activePairingKey).not.toBe(completed.pendingPairingKey)

    const exported = provider.exportPairingKeyMaterial(activation.activePairingKey)
    expect(exported).toEqual(pairingKey)
    expect(exported).not.toBe(activation.activePairingKey)
  })

  it('seals Relay authority as development JSON the Mobile keyless client opens', async () => {
    const provider = new DevelopmentKeylessPairingHandshakeProvider()
    const grant = {
      endpoint: 'mobile' as const,
      routeId: parseRelayRouteId('route-mobile'),
      credential: parseRelayCredential('AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE'),
      revision: 2,
    }
    const sealed = await provider.sealMobileRelayAuthority({
      activePairingKey: await deriveKeylessPairingKey(SECRET),
      grant,
    })
    expect(JSON.parse(new TextDecoder().decode(sealed))).toEqual({
      endpoint: 'mobile',
      routeId: 'route-mobile',
      credential: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
      revision: 2,
    })
  })

  it('zeroes destroyed provider-private material', async () => {
    const provider = new DevelopmentKeylessPairingHandshakeProvider()
    const challenge = await provider.createChallenge({ invitationSecret: SECRET, expiresAt: 1 })
    provider.destroyChallenge(challenge.state)
    expect(challenge.state).toEqual(new Uint8Array(32))
    const completed = await provider.completeChallenge({
      invitationSecret: SECRET, challengeState: SECRET.slice(), mobileHandshake: Uint8Array.of(0),
    })
    provider.destroyPendingPairing(completed.pendingPairingKey)
    expect(completed.pendingPairingKey).toEqual(new Uint8Array(32))
    const activation = await provider.activatePairing({ pendingPairingKey: await deriveKeylessPairingKey(SECRET) })
    provider.destroyPairing(activation.activePairingKey)
    expect(activation.activePairingKey).toEqual(new Uint8Array(32))
  })
})
