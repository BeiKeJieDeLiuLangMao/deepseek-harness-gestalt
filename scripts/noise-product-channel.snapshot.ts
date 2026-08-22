/** Keyless runnable snapshot for the product Snow channel library. */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  parseRelayAttachmentId,
  parseRelayCredential,
  parseRelayPairingSelector,
  parseRelayRouteId,
} from '@deepseek-ai/dsh-remote-protocol'
import {
  SnowCompanionProtocolChannel,
  SnowMobileHandshakeClient,
  SnowPairingHandshakeProvider,
  acceptSnowDesktopReconnect,
  beginSnowMobileReconnect,
  initializeSnowChannel,
} from '@deepseek-ai/dsh-noise-channel'

const expected = new URL('./snapshots/noise-product-channel/report.expected.json', import.meta.url)

describe('Snow product channel runnable snapshot', () => {
  it('executes pairing, sealed authority, fresh reconnect, and authenticated synchronization', async () => {
    initializeSnowChannel(readFileSync(new URL('../packages/platform/noise-channel/pkg/dsh_noise_channel_bg.wasm', import.meta.url)))
    const invitationSecret = crypto.getRandomValues(new Uint8Array(32))
    const desktop = new SnowPairingHandshakeProvider()
    const challenge = await desktop.createChallenge({ invitationSecret, expiresAt: Date.now() + 60_000 })
    const mobile = new SnowMobileHandshakeClient()
    const link = invitationLink(invitationSecret, challenge.desktopFingerprint, challenge.desktopStaticPublicKey)
    const begun = await mobile.begin(link)
    const opened = await desktop.completeChallenge({
      invitationSecret,
      challengeState: challenge.state,
      mobileHandshake: begun.mobileHandshake,
    })
    await mobile.acceptDesktopHandshake(opened.desktopHandshake)
    const finished = await desktop.finishChallenge({
      pendingPairingKey: opened.pendingPairingKey,
      mobileFinish: mobile.exportFinishMessage(),
    })
    const activation = await desktop.activatePairing({ pendingPairingKey: finished.pendingPairingKey })
    const credential = parseRelayCredential('A'.repeat(43))
    const sealed = await desktop.sealMobileRelayAuthority({
      activePairingKey: activation.activePairingKey,
      grant: {
        endpoint: 'mobile', routeId: parseRelayRouteId('route-snapshot'), credential, revision: 1,
        pairingSelector: parseRelayPairingSelector('pairing-snapshot'),
      },
    })
    await mobile.openRelayAuthority(sealed)
    const binding = {
      routeId: parseRelayRouteId('route-snapshot'),
      pairingSelector: parseRelayPairingSelector('pairing-snapshot'),
      desktopAttachmentId: parseRelayAttachmentId('desktop-snapshot'),
      mobileAttachmentId: parseRelayAttachmentId('mobile-snapshot'),
      generation: 1,
    }
    const first = await beginSnowMobileReconnect(mobile.exportReconnectState(), binding)
    const responder = await acceptSnowDesktopReconnect(
      desktop.exportReconnectState(activation.activePairingKey),
      binding,
      first.message1,
    )
    const mobileChannel = new SnowCompanionProtocolChannel(first.finish(responder.message2))
    const desktopChannel = new SnowCompanionProtocolChannel(responder.channel)
    const synchronization = {
      type: 'projection' as const,
      projection: { type: 'foreground-sync' as const, generation: 1, desktopRevision: 1 },
    }
    const decoded = mobileChannel.open(desktopChannel.seal(synchronization))
    const second = await beginSnowMobileReconnect(mobile.exportReconnectState(), { ...binding, generation: 2 })
    let staleTranscriptRejected = false
    try {
      await acceptSnowDesktopReconnect(
        desktop.exportReconnectState(activation.activePairingKey),
        { ...binding, generation: 2 },
        first.message1,
      )
    } catch {
      staleTranscriptRejected = true
    }
    second.cancel()
    const report = JSON.stringify({
      schemaVersion: 1,
      xkpsk3: 'pass',
      sealedRelayAuthority: !new TextDecoder().decode(sealed).includes(credential),
      ikFreshEphemerals: !equal(first.message1.slice(0, 32), second.message1.slice(0, 32)),
      authenticatedForegroundSync: decoded.type === 'projection'
        && decoded.projection.type === 'foreground-sync'
        && decoded.projection.generation === 1,
      staleTranscriptRejected,
    }, null, 2) + '\n'
    await expect(report).toMatchFileSnapshot(expected.pathname)
  })
})

function invitationLink(secret: Uint8Array, fingerprint: string, desktopPublic: Uint8Array): string {
  const link = new URL('https://www.gestaltrun.com/pair')
  link.searchParams.set('challenge', 'challenge-snapshot')
  link.searchParams.set('secret', Buffer.from(secret).toString('base64url'))
  link.searchParams.set('fingerprint', fingerprint)
  link.searchParams.set('spk', Buffer.from(desktopPublic).toString('base64url'))
  link.searchParams.set('rendezvous', 'rendezvous-snapshot')
  link.searchParams.set('expires', String(Date.now() + 60_000))
  link.searchParams.set('protocol', '1')
  return link.toString()
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index])
}
