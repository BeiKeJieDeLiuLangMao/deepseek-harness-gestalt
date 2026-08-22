import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  decodeRelayMessage, encodeRelayMessage, parseRelayAttachmentId, parseRelayPairingSelector,
  REMOTE_PROTOCOL_LIMITS,
} from '@deepseek-ai/dsh-remote-protocol'
import {
  createDesktopRemoteRelay,
  loadDesktopRemoteRelayConfig,
} from '../src/remote-relay.ts'
import { DesktopSnowPairingVault } from '../src/snow-pairing-vault.ts'
import { parseRelayCredential, parseRelayRouteId } from '@deepseek-ai/dsh-remote-protocol'
import {
  initializeSnowChannel, SnowMobileAttachmentOwner, SnowMobileHandshakeClient,
} from '@deepseek-ai/dsh-noise-channel'
import { parsePairingChallengeId, parsePendingPairingId, parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import type { RelayEndpointSocket } from '@deepseek-ai/dsh-remote-access-client'

const DEVELOPMENT = {
  environment: 'development',
  origin: 'https://platform.example',
  callbackUrl: 'http://127.0.0.1:9327/callback',
  githubClientId: 'client',
  credentialReference: 'credential',
  databaseIdentity: 'development',
  identityNamespace: 'development',
} as const

const SOURCE = {
  DSH_REMOTE_RELAY_WSS_URL: 'wss://platform.example/v1/remote-access/relay',
  DSH_REMOTE_RELAY_ATTACH_TIMEOUT_MS: '1000',
  DSH_REMOTE_RELAY_HEARTBEAT_INTERVAL_MS: '30000',
  DSH_REMOTE_RELAY_RECONNECT_DELAY_MS: '1000',
  DSH_REMOTE_RELAY_INBOUND_MAX_BYTES: String(REMOTE_PROTOCOL_LIMITS.relayMessageBytes),
  DSH_REMOTE_RELAY_INBOUND_MAX_MESSAGES: '16',
}

describe('Desktop Remote Relay composition', () => {
  it('mounts Desktop IK ownership and sends authenticated foreground synchronization', async () => {
    initializeSnowChannel(readFileSync(new URL(
      '../../../packages/platform/noise-channel/pkg/dsh_noise_channel_bg.wasm', import.meta.url,
    )))
    const vault = new DesktopSnowPairingVault()
    const local = await vault.createInvitation(Date.now() + 60_000)
    const mobileHandshake = new SnowMobileHandshakeClient()
    const message1 = await mobileHandshake.beginEndpointInvitation(local.invitationPayload)
    const message2 = await local.owner.acceptMessage1(message1)
    await mobileHandshake.acceptDesktopHandshake(message2)
    await local.owner.finishMessage3(mobileHandshake.exportFinishMessage())
    const pairingId = parsePersonalPairingId('pairing-assembled-mount')
    const mobileGrant = {
      routeId: parseRelayRouteId('route-assembled-mount'), endpoint: 'mobile' as const,
      credential: parseRelayCredential('AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE'), revision: 1,
      pairingSelector: parseRelayPairingSelector(pairingId),
    }
    const sealed = await local.owner.sealMobileRelayAuthority(mobileGrant)
    await mobileHandshake.openRelayAuthority(sealed)
    const reconnectState = local.owner.exportReconnectState()
    const challengeId = parsePairingChallengeId('challenge-assembled-mount')
    const pendingPairingId = parsePendingPairingId('pending-assembled-mount')
    vault.retainChallenge(challengeId, local.owner)
    vault.bindPending(challengeId, pendingPairingId)
    vault.activate(pendingPairingId, pairingId, reconnectState)

    const socket = new TestRelaySocket()
    const relay = createDesktopRemoteRelay({
      environment: { ...DEVELOPMENT, environment: 'production' }, source: SOURCE,
      snowPairingVault: vault, connect: async () => socket, initializeWasm: () => {},
    })
    const desktopGrant = {
      routeId: mobileGrant.routeId, endpoint: 'desktop' as const,
      credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), revision: 1,
    }
    await relay.configure?.(desktopGrant)
    const starting = relay.start()
    await vi.waitFor(() => { expect(socket.sent).toHaveLength(1) })
    const attach = decodeRelayMessage(socket.sent[0] as Uint8Array)
    if (attach.type !== 'attach') throw new Error('Desktop Relay did not attach')
    const mobileAttachmentId = parseRelayAttachmentId('mobile-assembled-mount')
    const generation = 9
    const ready = {
      type: 'ready' as const, transportVersion: 1 as const, routeId: mobileGrant.routeId,
      attachmentId: attach.attachmentId,
      peers: [{ attachmentId: mobileAttachmentId, pairingSelector: mobileGrant.pairingSelector, generation }],
    }
    socket.push(encodeRelayMessage(ready))
    await starting
    const mobileOwner = new SnowMobileAttachmentOwner(
      mobileHandshake.exportReconnectState(), mobileGrant.pairingSelector,
    )
    const begun = await mobileOwner.begin({ ...ready, attachmentId: mobileAttachmentId, peers: [{
      attachmentId: attach.attachmentId, pairingSelector: mobileGrant.pairingSelector, generation,
    }] })
    socket.push(encodeRelayMessage({
      type: 'ciphertext', transportVersion: 1, routeId: mobileGrant.routeId,
      sourceAttachmentId: mobileAttachmentId, targetAttachmentId: attach.attachmentId,
      ciphertext: begun.payload,
    }))
    await vi.waitFor(() => { expect(socket.sent).toHaveLength(3) })
    const responses = socket.sent.slice(1).map(decodeRelayMessage)
    const ik2 = responses[0]
    const sync = responses[1]
    if (ik2?.type !== 'ciphertext' || sync?.type !== 'ciphertext') {
      throw new Error('Desktop Relay did not send IK2 and synchronization')
    }
    const channel = mobileOwner.finish(ik2.ciphertext, attach.attachmentId)
    expect(channel.open(sync.ciphertext)).toEqual({
      type: 'projection', projection: { type: 'foreground-sync', generation, desktopRevision: 1 },
    })
    await relay.stop('quit')
  })

  it('validates the complete development bundle before socket acquisition', () => {
    expect(loadDesktopRemoteRelayConfig(SOURCE)).toEqual({
      url: SOURCE.DSH_REMOTE_RELAY_WSS_URL,
      attachTimeoutMs: 1_000,
      heartbeatIntervalMs: 30_000,
      reconnectDelayMs: 1_000,
      inboundMaxBytes: REMOTE_PROTOCOL_LIMITS.relayMessageBytes,
      inboundMaxMessages: 16,
    })
    for (const [field, value] of [
      ['DSH_REMOTE_RELAY_WSS_URL', 'ws://platform.example/relay'],
      ['DSH_REMOTE_RELAY_ATTACH_TIMEOUT_MS', '0'],
      ['DSH_REMOTE_RELAY_HEARTBEAT_INTERVAL_MS', '1.5'],
      ['DSH_REMOTE_RELAY_RECONNECT_DELAY_MS', ''],
      ['DSH_REMOTE_RELAY_INBOUND_MAX_BYTES', String(REMOTE_PROTOCOL_LIMITS.relayMessageBytes - 1)],
      ['DSH_REMOTE_RELAY_INBOUND_MAX_MESSAGES', 'many'],
    ] as const) {
      expect(() => loadDesktopRemoteRelayConfig({ ...SOURCE, [field]: value })).toThrow()
    }
  })

  it('selects the endpoint-owned lifecycle only in production', async () => {
    const connect = vi.fn(async (signal: AbortSignal) => await new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => { reject(new Error('cancelled')) }, { once: true })
    }))
    const production = createDesktopRemoteRelay({
      environment: { ...DEVELOPMENT, environment: 'production' },
      source: SOURCE,
      connect,
      snowPairingVault: new DesktopSnowPairingVault(),
      initializeWasm: () => {},
    })
    await production.configure?.({
      routeId: parseRelayRouteId('route-production'), endpoint: 'desktop',
      credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), revision: 1,
    })
    const starting = production.start()
    await vi.waitFor(() => { expect(connect).toHaveBeenCalledOnce() })
    await production.stop('quit')
    await expect(starting).rejects.toThrow()
    const disabled = createDesktopRemoteRelay({
      environment: DEVELOPMENT, source: SOURCE, connect,
      snowPairingVault: new DesktopSnowPairingVault(),
    })
    await expect(disabled.start()).rejects.toThrow('independently reviewed')
    expect(connect).toHaveBeenCalledOnce()
  })

  it('validates Relay configuration independently from disabled composition', () => {
    expect(() => loadDesktopRemoteRelayConfig({
      ...SOURCE,
      DSH_REMOTE_RELAY_ATTACH_TIMEOUT_MS: undefined,
    })).toThrow('DSH_REMOTE_RELAY_ATTACH_TIMEOUT_MS')
  })
})

class TestRelaySocket implements RelayEndpointSocket {
  readonly sent: Uint8Array[] = []
  private readonly queued: Uint8Array[] = []
  private readonly waiting: Array<(value: IteratorResult<Uint8Array>) => void> = []
  private closed = false

  async send(value: Uint8Array): Promise<void> { this.sent.push(value.slice()) }
  push(value: Uint8Array): void {
    const resolve = this.waiting.shift()
    if (resolve === undefined) this.queued.push(value)
    else resolve({ done: false, value })
  }
  messages(): AsyncIterable<Uint8Array> {
    return { [Symbol.asyncIterator]: () => ({ next: async () => {
      const value = this.queued.shift()
      if (value !== undefined) return { done: false as const, value }
      if (this.closed) return { done: true as const, value: undefined }
      return await new Promise<IteratorResult<Uint8Array>>((resolve) => { this.waiting.push(resolve) })
    } }) }
  }
  async close(): Promise<void> {
    this.closed = true
    for (const resolve of this.waiting.splice(0)) resolve({ done: true, value: undefined })
  }
}
