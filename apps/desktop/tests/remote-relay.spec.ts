import { describe, expect, it, vi } from 'vitest'
import {
  decodeRelayMessage,
  encodeRelayMessage,
  parseRelayAttachmentId,
  parseRelayCredential,
  parseRelayRouteId,
  REMOTE_PROTOCOL_LIMITS,
} from '@deepseek-ai/dsh-remote-protocol'
import { NodeRelayEndpointSocket } from '@deepseek-ai/dsh-remote-access-client/node-relay-socket'
import type { RelayEndpointSocket } from '@deepseek-ai/dsh-remote-access-client'
import {
  createDesktopRemoteRelay,
  loadDesktopRemoteRelayConfig,
} from '../src/remote-relay.ts'

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
  DSH_PERSONAL_PAIRING_KEYLESS: '1',
  DSH_REMOTE_RELAY_WSS_URL: 'wss://platform.example/v1/remote-access/relay',
  DSH_REMOTE_RELAY_ATTACH_TIMEOUT_MS: '1000',
  DSH_REMOTE_RELAY_HEARTBEAT_INTERVAL_MS: '30000',
  DSH_REMOTE_RELAY_RECONNECT_DELAY_MS: '1000',
  DSH_REMOTE_RELAY_INBOUND_MAX_BYTES: String(REMOTE_PROTOCOL_LIMITS.relayMessageBytes),
  DSH_REMOTE_RELAY_INBOUND_MAX_MESSAGES: '16',
}

describe('Desktop Remote Relay composition', () => {
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

  it('keeps production fail-closed and assembles a cancellable development endpoint', async () => {
    const connect = vi.fn(async (signal: AbortSignal) => await new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => { reject(new Error('cancelled')) }, { once: true })
    }))
    const production = createDesktopRemoteRelay({
      environment: { ...DEVELOPMENT, environment: 'production' },
      source: SOURCE,
      connect,
    })
    await expect(production.start()).rejects.toThrow('independently reviewed')
    expect(connect).not.toHaveBeenCalled()
    const disabled = createDesktopRemoteRelay({
      environment: DEVELOPMENT, source: { ...SOURCE, DSH_PERSONAL_PAIRING_KEYLESS: '0' }, connect,
    })
    await expect(disabled.start()).rejects.toThrow('independently reviewed')

    const development = createDesktopRemoteRelay({ environment: DEVELOPMENT, source: SOURCE, connect })
    await development.configure?.({
      routeId: parseRelayRouteId('route-development'),
      credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      revision: 1,
    })
    const starting = development.start()
    await vi.waitFor(() => { expect(connect).toHaveBeenCalledOnce() })
    const stopping = development.stop('window-close')
    await expect(Promise.allSettled([starting, stopping])).resolves.toHaveLength(2)
    expect(connect.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal)
  })

  it('rejects development proof mode without a complete config before connecting', async () => {
    const connect = vi.fn()
    expect(() => createDesktopRemoteRelay({
      environment: DEVELOPMENT,
      source: { ...SOURCE, DSH_REMOTE_RELAY_ATTACH_TIMEOUT_MS: undefined },
      connect,
    })).toThrow('DSH_REMOTE_RELAY_ATTACH_TIMEOUT_MS')
    expect(connect).not.toHaveBeenCalled()
  })

  it('uses the production Node adapter and rejects ciphertext without a product crypto owner', async () => {
    const first = new ReadySocket()
    const second = new ReadySocket()
    const connect = vi.spyOn(NodeRelayEndpointSocket, 'connect')
      .mockResolvedValueOnce(first as never)
      .mockResolvedValueOnce(second as never)
    const relay = createDesktopRemoteRelay({
      environment: DEVELOPMENT,
      source: { ...SOURCE, DSH_REMOTE_RELAY_RECONNECT_DELAY_MS: '1' },
    })
    await relay.configure?.({
      routeId: parseRelayRouteId('route-development'),
      credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      revision: 1,
    })

    await relay.start()
    expect(connect.mock.calls[0]?.[3]).toBeUndefined()
    expect(relay.getState?.()).toEqual({ connected: true })
    const attachmentId = first.attachmentId
    if (attachmentId === undefined) throw new Error('fixture did not observe attach')
    first.receive(encodeRelayMessage({
      type: 'ciphertext', transportVersion: 1,
      routeId: parseRelayRouteId('route-development'),
      sourceAttachmentId: parseRelayAttachmentId('mobile-development'),
      targetAttachmentId: attachmentId,
      ciphertext: Uint8Array.of(1),
    }))
    await vi.waitFor(() => { expect(connect).toHaveBeenCalledTimes(2) })
    await relay.stop('quit')
    expect(relay.getState?.()).toEqual({ connected: false, stopReason: 'quit' })
    connect.mockRestore()
  })

  it('accepts the bundled certificate on a loopback development WSS listen', async () => {
    const socket = new ReadySocket()
    const connect = vi.spyOn(NodeRelayEndpointSocket, 'connect').mockResolvedValueOnce(socket as never)
    const relay = createDesktopRemoteRelay({
      environment: DEVELOPMENT,
      source: { ...SOURCE, DSH_REMOTE_RELAY_WSS_URL: 'wss://127.0.0.1:8443/v1/remote-access/relay' },
    })
    await relay.configure?.({
      routeId: parseRelayRouteId('route-loopback'),
      credential: parseRelayCredential('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      revision: 1,
    })
    await relay.start()
    expect(connect.mock.calls[0]?.[3]).toEqual({ rejectUnauthorized: false })
    await relay.stop('quit')
    connect.mockRestore()
  })
})

class ReadySocket implements RelayEndpointSocket {
  private readonly values: Uint8Array[] = []
  private readonly waiters: Array<(value: IteratorResult<Uint8Array>) => void> = []
  attachmentId: ReturnType<typeof parseRelayAttachmentId> | undefined

  async send(value: Uint8Array): Promise<void> {
    const message = decodeRelayMessage(value)
    if (message.type !== 'attach') return
    this.attachmentId = message.attachmentId
    this.receive(encodeRelayMessage({
      type: 'ready', transportVersion: 1, attachmentId: message.attachmentId,
    }))
  }

  messages(): AsyncIterable<Uint8Array> {
    return {
      [Symbol.asyncIterator]: () => ({
        next: async () => await new Promise<IteratorResult<Uint8Array>>((resolve) => {
          const value = this.values.shift()
          if (value === undefined) this.waiters.push(resolve)
          else resolve({ done: false, value })
        }),
      }),
    }
  }

  receive(value: Uint8Array): void {
    const waiter = this.waiters.shift()
    if (waiter === undefined) this.values.push(value)
    else waiter({ done: false, value })
  }

  async close(): Promise<void> {
    for (const waiter of this.waiters.splice(0)) waiter({ done: true, value: undefined })
  }
}
