import { describe, expect, it } from 'vitest'
import { parseRelayCredential, parseRelayRouteId } from '@deepseek-ai/dsh-remote-protocol'
import {
  openSnowRelayAuthority,
  SnowMobileHandshakeClient,
  SnowPairingHandshakeProvider,
} from '../src/index.ts'

describe('Snow pairing handshake', () => {
  it('completes XKpsk3 across Mobile and a rebuilt responder', async () => {
    const invitationSecret = crypto.getRandomValues(new Uint8Array(32))
    const first = new SnowPairingHandshakeProvider()
    const challenge = await first.createChallenge({ invitationSecret, expiresAt: Date.now() + 60_000 })
    expect(challenge.desktopStaticPublicKey?.byteLength).toBe(32)
    expect(challenge.desktopFingerprint.startsWith('snow-')).toBe(true)

    const mobile = new SnowMobileHandshakeClient()
    const origin = 'https://www.gestaltrun.com/pair'
    const link = new URL(origin)
    link.searchParams.set('challenge', 'challenge-one')
    link.searchParams.set('secret', encodeBase64Url(invitationSecret))
    link.searchParams.set('fingerprint', challenge.desktopFingerprint)
    link.searchParams.set('spk', encodeBase64Url(challenge.desktopStaticPublicKey!))
    link.searchParams.set('rendezvous', 'rendezvous-one')
    link.searchParams.set('expires', String(Date.now() + 60_000))
    link.searchParams.set('protocol', '1')
    const begun = await mobile.begin(link.toString())

    const completed = await first.completeChallenge({
      invitationSecret,
      challengeState: challenge.state,
      mobileHandshake: begun.mobileHandshake,
    })
    await mobile.acceptDesktopHandshake(completed.desktopHandshake)

    const rebuilt = new SnowPairingHandshakeProvider()
    const finished = await rebuilt.finishChallenge({
      pendingPairingKey: completed.pendingPairingKey,
      mobileFinish: mobile.exportFinishMessage(),
    })
    expect(finished.handshakeHash).toEqual(mobile.exportPairingKeyMaterial())

    const activated = await rebuilt.activatePairing({ pendingPairingKey: finished.pendingPairingKey })
    const grant = {
      endpoint: 'mobile' as const,
      routeId: parseRelayRouteId('route-one'),
      credential: parseRelayCredential('A'.repeat(43)),
      revision: 1,
    }
    const sealed = await rebuilt.sealMobileRelayAuthority({
      activePairingKey: activated.activePairingKey,
      grant,
    })
    await expect(mobile.openRelayAuthority(sealed)).resolves.toEqual(grant)
    expect(rebuilt.exportPairingKeyMaterial(activated.activePairingKey).byteLength).toBe(32)
    first.destroyChallenge(challenge.state)
    first.destroyPendingPairing(completed.pendingPairingKey)
    rebuilt.destroyPairing(activated.activePairingKey)
  })

  it('rejects invalid challenge, pairing, and grant material', async () => {
    const provider = new SnowPairingHandshakeProvider()
    const invitationSecret = crypto.getRandomValues(new Uint8Array(32))
    await expect(provider.createChallenge({ invitationSecret: Uint8Array.of(1), expiresAt: 1 }))
      .rejects.toThrow('exactly 256 bits')
    const challenge = await provider.createChallenge({ invitationSecret, expiresAt: 1 })
    await expect(provider.completeChallenge({
      invitationSecret: Uint8Array.of(1),
      challengeState: challenge.state,
      mobileHandshake: Uint8Array.of(1),
    })).rejects.toThrow('exactly 256 bits')
    await expect(provider.completeChallenge({
      invitationSecret,
      challengeState: Uint8Array.of(1),
      mobileHandshake: Uint8Array.of(1),
    })).rejects.toThrow('challenge state is invalid')
    await expect(provider.finishChallenge({
      pendingPairingKey: Uint8Array.of(2) as never,
      mobileFinish: Uint8Array.of(1),
    })).rejects.toThrow('open pairing state is invalid')
    const truncatedOpen = new Uint8Array(1 + 32 * 3 + 2)
    truncatedOpen[0] = 2
    truncatedOpen[1 + 32 * 3 + 1] = 1
    await expect(provider.finishChallenge({
      pendingPairingKey: truncatedOpen as never,
      mobileFinish: Uint8Array.of(1),
    })).rejects.toThrow('truncated')
    await expect(provider.activatePairing({ pendingPairingKey: Uint8Array.of(3) as never }))
      .rejects.toThrow('pairing key is invalid')
    const rawKey = new Uint8Array(32).fill(3)
    const activated = await provider.activatePairing({ pendingPairingKey: rawKey as never })
    await expect(openSnowRelayAuthority(rawKey, Uint8Array.of(1))).rejects.toThrow('truncated')
    const sealed = await provider.sealMobileRelayAuthority({
      activePairingKey: activated.activePairingKey,
      grant: {
        endpoint: 'mobile',
        routeId: parseRelayRouteId('route-one'),
        credential: parseRelayCredential('A'.repeat(43)),
        revision: 1,
      },
    })
    await expect(openSnowRelayAuthority(new Uint8Array(31), sealed)).rejects.toThrow('32 bytes')
    await expect(openSnowRelayAuthority(new Uint8Array(32), sealed)).rejects.toThrow()
    await expect(openSnowRelayAuthority(rawKey, await sealJson(rawKey, []))).rejects.toThrow('must be an object')
    await expect(openSnowRelayAuthority(rawKey, await sealJson(rawKey, { endpoint: 'desktop' }))).rejects.toThrow('endpoint must be mobile')
    await expect(openSnowRelayAuthority(rawKey, await sealJson(rawKey, {
      endpoint: 'mobile', routeId: 'route-one', credential: 'A'.repeat(43), revision: 0,
    }))).rejects.toThrow('revision must be positive')
    const mobile = new SnowMobileHandshakeClient()
    await expect(mobile.begin('https://www.gestaltrun.com/pair?challenge=c&secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&fingerprint=fp&rendezvous=r&expires=1&protocol=1'))
      .rejects.toThrow('Desktop static public key')
    await expect(mobile.acceptDesktopHandshake(Uint8Array.of(1))).rejects.toThrow('no prepared invitation')
    expect(() => mobile.exportFinishMessage()).toThrow('no finish message')
    expect(() => { void mobile.openRelayAuthority(Uint8Array.of(1)) }).toThrow('no pairing key')
    mobile.wipe()
  })
})

async function sealJson(key: Uint8Array, value: unknown): Promise<Uint8Array> {
  const iv = new Uint8Array(12)
  const sealed = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']),
    new TextEncoder().encode(JSON.stringify(value)),
  ))
  const out = new Uint8Array(12 + sealed.byteLength)
  out.set(sealed, 12)
  return out
}

function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}
