import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { parsePairingChallengeId, parsePendingPairingId, parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import { initializeSnowChannel, SnowMobileHandshakeClient } from '@deepseek-ai/dsh-noise-channel'
import { parseRelayRouteId } from '@deepseek-ai/dsh-remote-protocol'
import {
  DesktopSnowPairingVault,
  EncryptedDesktopSnowPairingStore,
} from '../src/snow-pairing-vault.ts'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true }))) })

describe('DesktopSnowPairingVault', () => {
  it('recovers every Desktop-owned handshake and confirmation commit point from protected state', async () => {
    initializeSnowChannel(readFileSync(new URL(
      '../../../packages/platform/noise-channel/pkg/dsh_noise_channel_bg.wasm', import.meta.url,
    )))
    const directory = await mkdtemp(join(tmpdir(), 'dsh-snow-vault-'))
    directories.push(directory)
    const path = join(directory, 'pairings.bin')
    const protection = {
      encrypt: (value: string) => new TextEncoder().encode(`protected:${value}`),
      decrypt: (value: Uint8Array) => new TextDecoder().decode(value).replace(/^protected:/u, ''),
    }
    const store = new EncryptedDesktopSnowPairingStore(path, protection)
    let vault = await DesktopSnowPairingVault.load(store)
    const invitation = await vault.createInvitation(Date.now() + 60_000)
    const challengeId = parsePairingChallengeId('challenge-persist')
    const pendingPairingId = parsePendingPairingId('pending-persist')
    const pairingId = parsePersonalPairingId('pairing-persist')
    vault.retainChallenge(challengeId, invitation.owner)
    await vault.flush()

    vault = await DesktopSnowPairingVault.load(store)
    const mobile = new SnowMobileHandshakeClient()
    const message1 = await mobile.beginEndpointInvitation(invitation.invitationPayload)
    let owner = vault.bindPending(challengeId, pendingPairingId)
    const message2 = await owner.acceptMessage1(message1)
    await vault.checkpointPending(pendingPairingId)

    vault = await DesktopSnowPairingVault.load(store)
    owner = vault.pendingOwner(pendingPairingId) ?? (() => { throw new Error('pending owner was not restored') })()
    expect(await owner.acceptMessage1(message1)).toEqual(message2)
    await mobile.acceptDesktopHandshake(message2)
    await owner.finishMessage3(mobile.exportFinishMessage())
    await vault.checkpointPending(pendingPairingId)
    const prepared = await vault.prepareConfirmation(pendingPairingId)
    expect(prepared.desktopCredentialDigest).not.toEqual(prepared.mobileCredentialDigest)

    vault = await DesktopSnowPairingVault.load(store)
    const replay = await vault.prepareConfirmation(pendingPairingId)
    expect(replay).toEqual(prepared)
    const confirmation = {
      pairing: {
        id: pairingId,
        devicePrincipal: {
          id: 'principal-persist' as never, accountId: 'account-persist' as never,
          installationId: 'mobile-persist' as never, authority: 'companion-surface' as const,
        },
        device: { name: 'Alice phone', platform: 'ios' as const },
        pairedAt: 1, lastAccessAt: 1, online: false,
      },
      routeId: parseRelayRouteId('route-persist'), relayRevision: 7,
    }
    const delivery = await vault.prepareSealedAuthority(pendingPairingId, confirmation)

    vault = await DesktopSnowPairingVault.load(store)
    expect(vault.desktopRelayGrant(pendingPairingId)).toMatchObject({
      endpoint: 'desktop', routeId: 'route-persist', revision: 7, pairingSelector: pairingId,
    })
    await expect(mobile.openRelayAuthority(delivery.sealedRelayAuthority)).resolves.toMatchObject({
      endpoint: 'mobile', routeId: 'route-persist', revision: 7, pairingSelector: pairingId,
    })
    await vault.commitConfirmation(pendingPairingId)

    const disk = await readFile(path, 'utf8')
    expect(disk).not.toContain('pairing-persist')
    const restored = await DesktopSnowPairingVault.load(store)
    expect(restored.reconnectState('pairing-persist' as never)).toHaveLength(96)
    expect(restored.desktopRelayGrants()).toHaveLength(1)
    restored.release(pairingId)
    await restored.flush()
    expect((await DesktopSnowPairingVault.load(store))
      .reconnectState('pairing-persist' as never)).toBeUndefined()
  })
})
