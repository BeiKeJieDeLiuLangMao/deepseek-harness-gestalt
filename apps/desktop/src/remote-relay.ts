/** Desktop Host composition for the endpoint-owned Snow Remote Relay endpoint. */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { SelectedPlatformEnvironment } from '@deepseek-ai/dsh-platform-account'
import { parseRelayAttachmentId, REMOTE_PROTOCOL_LIMITS, type RelayPeerDescriptor } from '@deepseek-ai/dsh-remote-protocol'
import type { RelayEndpointSocket } from '@deepseek-ai/dsh-remote-access-client'
import {
  DesktopRelayEndpointLifecycle,
  FailClosedDesktopRelayLifecycle,
  type DesktopRelayLifecycle,
} from '@deepseek-ai/dsh-remote-access-client/desktop-relay-lifecycle'
import { NodeRelayEndpointSocket } from '@deepseek-ai/dsh-remote-access-client/node-relay-socket'
import {
  initializeSnowChannel,
  SnowDesktopAttachmentOwner,
  type SnowCompanionProtocolChannel,
} from '@deepseek-ai/dsh-noise-channel'
import { sealDesktopForegroundSynchronization } from './noise-companion.ts'
import type { DesktopSnowPairingVault } from './snow-pairing-vault.ts'

const CRYPTO_GATE = 'Personal Pairing requires an independently reviewed handshake and Relay crypto provider.'

/** Validated Desktop endpoint deployment inputs. */
export interface DesktopRemoteRelayConfig {
  url: string
  attachTimeoutMs: number
  heartbeatIntervalMs: number
  reconnectDelayMs: number
  inboundMaxBytes: number
  inboundMaxMessages: number
}

/** Product composition dependencies for a Desktop Relay lifecycle. */
export interface DesktopRemoteRelayOptions {
  environment: SelectedPlatformEnvironment
  source: NodeJS.ProcessEnv | Record<string, string | undefined>
  connect?: (signal: AbortSignal, config: DesktopRemoteRelayConfig) => Promise<RelayEndpointSocket>
  snowPairingVault: DesktopSnowPairingVault
  initializeWasm?: () => void
}

/**
 * Parse the complete Desktop WSS bundle before network acquisition.
 * @param source - Desktop process environment.
 * @returns validated WSS and bounded queue inputs.
 */
export function loadDesktopRemoteRelayConfig(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): DesktopRemoteRelayConfig {
  const url = required(source, 'DSH_REMOTE_RELAY_WSS_URL')
  if (new URL(url).protocol !== 'wss:') throw new TypeError('DSH_REMOTE_RELAY_WSS_URL must use WSS')
  const config: DesktopRemoteRelayConfig = {
    url,
    attachTimeoutMs: positiveInteger(source, 'DSH_REMOTE_RELAY_ATTACH_TIMEOUT_MS'),
    heartbeatIntervalMs: positiveInteger(source, 'DSH_REMOTE_RELAY_HEARTBEAT_INTERVAL_MS'),
    reconnectDelayMs: positiveInteger(source, 'DSH_REMOTE_RELAY_RECONNECT_DELAY_MS'),
    inboundMaxBytes: positiveInteger(source, 'DSH_REMOTE_RELAY_INBOUND_MAX_BYTES'),
    inboundMaxMessages: positiveInteger(source, 'DSH_REMOTE_RELAY_INBOUND_MAX_MESSAGES'),
  }
  if (config.inboundMaxBytes < REMOTE_PROTOCOL_LIMITS.relayMessageBytes) {
    throw new TypeError('DSH_REMOTE_RELAY_INBOUND_MAX_BYTES must admit one maximum Relay message')
  }
  return config
}

/**
 * Select the observable production crypto gate or the explicit development endpoint.
 * @param options - Platform environment, process configuration, and optional socket adapter.
 * @returns Desktop-owned Relay lifecycle injected into Settings.
 */
export function createDesktopRemoteRelay(options: DesktopRemoteRelayOptions): DesktopRelayLifecycle {
  if (options.environment.environment !== 'production') return new FailClosedDesktopRelayLifecycle(CRYPTO_GATE)
  const config = loadDesktopRemoteRelayConfig(options.source)
  ;(options.initializeWasm ?? initializeDesktopSnowWasm)()
  const owner = new SnowDesktopAttachmentOwner(selector => options.snowPairingVault.reconnectState(selector))
  const channels = new Map<string, {
    channel: SnowCompanionProtocolChannel
    peer: RelayPeerDescriptor
  }>()
  let projection: {
    routeId: Parameters<SnowDesktopAttachmentOwner['accept']>[2]
    attachmentId: Parameters<SnowDesktopAttachmentOwner['accept']>[3]
    peers: readonly RelayPeerDescriptor[]
  } | undefined
  let desktopRevision = 0
  const lifecycle = new DesktopRelayEndpointLifecycle({
    attachmentId: () => parseRelayAttachmentId(crypto.randomUUID()),
    connect: async signal => options.connect === undefined
      ? await NodeRelayEndpointSocket.connect(config.url, signal, {
        maxBytes: config.inboundMaxBytes, maxMessages: config.inboundMaxMessages,
      })
      : await options.connect(signal, config),
    attachTimeoutMs: config.attachTimeoutMs,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    reconnectDelayMs: config.reconnectDelayMs,
    onPeerAttachments: (update) => {
      projection = { routeId: update.routeId, attachmentId: update.attachmentId, peers: update.peers }
    },
    onCiphertext: async (ciphertext, sourceAttachmentId) => {
      const current = projection
      if (current === undefined) throw new Error('Desktop Relay ciphertext has no peer projection')
      const existing = channels.get(sourceAttachmentId)
      const projected = current.peers.find(peer => peer.attachmentId === sourceAttachmentId)
      if (existing !== undefined) {
        if (projected === undefined || projected.generation !== existing.peer.generation
          || projected.pairingSelector !== existing.peer.pairingSelector) {
          throw new Error('Desktop Relay rejected a stale Snow channel')
        }
        existing.channel.open(ciphertext)
        return
      }
      if (projected === undefined) throw new Error('Desktop Relay rejected an unprojected Snow peer')
      const accepted = await owner.accept(
        ciphertext, sourceAttachmentId, current.routeId, current.attachmentId,
      )
      if (accepted.generation !== projected.generation
        || accepted.pairingSelector !== projected.pairingSelector) {
        accepted.channel.dispose()
        throw new Error('Desktop Relay rejected a stale Snow IK transcript')
      }
      for (const [attachmentId, active] of channels) {
        if (active.peer.pairingSelector === accepted.pairingSelector) {
          active.channel.dispose()
          channels.delete(attachmentId)
        }
      }
      channels.set(sourceAttachmentId, { channel: accepted.channel, peer: projected })
      await lifecycle.sendCiphertext(accepted.targetAttachmentId, accepted.payload)
      desktopRevision += 1
      await lifecycle.sendCiphertext(
        accepted.targetAttachmentId,
        sealDesktopForegroundSynchronization(accepted.channel, accepted.generation, desktopRevision),
      )
    },
    resynchronize: async () => {},
    onConnectionLost: () => {
      projection = undefined
      for (const active of channels.values()) active.channel.dispose()
      channels.clear()
    },
  })
  return lifecycle
}

function initializeDesktopSnowWasm(): void {
  const require = createRequire(import.meta.url)
  const glue = require.resolve('@deepseek-ai/dsh-noise-channel/snow-wasm')
  initializeSnowChannel(readFileSync(glue.replace(/\.js$/u, '_bg.wasm')))
}

function required(source: Record<string, string | undefined>, name: string): string {
  const value = source[name]
  if (value === undefined || value.length === 0) throw new TypeError(`${name} must be configured`)
  return value
}

function positiveInteger(source: Record<string, string | undefined>, name: string): number {
  const value = Number(required(source, name))
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`)
  return value
}
