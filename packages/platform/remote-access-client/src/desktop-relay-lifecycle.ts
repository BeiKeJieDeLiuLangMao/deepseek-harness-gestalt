import type { RelayAttachmentId, RelayPairingSelector, RelayPeerUpdateMessage, RelayReadyMessage } from '@deepseek-ai/dsh-remote-protocol'
import type { RelayCredentialGrant } from '@deepseek-ai/dsh-remote-access'
import {
  RemoteRelayEndpointController,
  type DesktopRelayStopReason,
  type RemoteRelayEndpointOptions,
} from './relay.ts'

/** Desktop-owned Relay lifecycle injected by the product composition. */
export interface DesktopRelayLifecycle {
  /** Install fresh endpoint-owned authority returned by a successful Settings enable. */
  configure?(grant: RelayCredentialGrant): void | Promise<void>
  /** Attach and resynchronize through the selected Platform endpoint. */
  start(): Promise<void>
  /** Make the route Remote Offline for one Desktop lifecycle reason. */
  stop(reason?: DesktopRelayStopReason): Promise<void>
  /** Read transport-only lifecycle state without exposing route authority. */
  getState?(): { connected: boolean; stopReason?: DesktopRelayStopReason }
}

/** Observable fail-closed Relay lifecycle used before production crypto/provider approval. */
export class FailClosedDesktopRelayLifecycle implements DesktopRelayLifecycle {
  private stopReason: DesktopRelayStopReason | undefined

  /** @param reason - production gate diagnostic. */
  constructor(private readonly reason: string) {}

  configure(): Promise<void> { return Promise.reject(new Error(this.reason)) }
  start(): Promise<void> { return Promise.reject(new Error(this.reason)) }
  stop(reason: DesktopRelayStopReason = 'quit'): Promise<void> {
    this.stopReason = reason
    return Promise.resolve()
  }

  /** @returns observable offline state for entry/process acceptance checks. */
  getState(): { connected: false; stopReason?: DesktopRelayStopReason } {
    return { connected: false, ...(this.stopReason === undefined ? {} : { stopReason: this.stopReason }) }
  }
}

/** Real Desktop endpoint composition that owns its current route grant. */
export class DesktopRelayEndpointLifecycle implements DesktopRelayLifecycle {
  private readonly endpoints = new Map<RelayPairingSelector, RemoteRelayEndpointController>()
  private stopReason: DesktopRelayStopReason | undefined
  private readonly options: Omit<RemoteRelayEndpointOptions, 'endpoint' | 'route' | 'onCiphertext' | 'onPeerAttachments'> & {
    onPeerAttachments?: (
      message: RelayReadyMessage | RelayPeerUpdateMessage,
      pairingSelector: RelayPairingSelector,
    ) => void | Promise<void>
    onCiphertext?: (
      ciphertext: Uint8Array,
      sourceAttachmentId: RelayAttachmentId,
      localAttachmentId: RelayAttachmentId,
      pairingSelector: RelayPairingSelector,
    ) => void | Promise<void>
  }

  /** @param options - Desktop endpoint adapters other than route authority. */
  constructor(options: Omit<RemoteRelayEndpointOptions, 'endpoint' | 'route' | 'onCiphertext' | 'onPeerAttachments'> & {
    onPeerAttachments?: (
      message: RelayReadyMessage | RelayPeerUpdateMessage,
      pairingSelector: RelayPairingSelector,
    ) => void | Promise<void>
    onCiphertext?: (
      ciphertext: Uint8Array,
      sourceAttachmentId: RelayAttachmentId,
      localAttachmentId: RelayAttachmentId,
      pairingSelector: RelayPairingSelector,
    ) => void | Promise<void>
  }) {
    this.options = options
  }

  configure(grant: RelayCredentialGrant): void {
    if (grant.endpoint !== 'desktop' || grant.pairingSelector === undefined) {
      throw new TypeError('Desktop Relay grant must belong to one Personal Pairing')
    }
    const selector = grant.pairingSelector
    let localAttachmentId: RelayAttachmentId | undefined
    const endpoint = new RemoteRelayEndpointController({
      ...this.options,
      endpoint: 'desktop',
      route: () => Promise.resolve(grant),
      onPeerAttachments: async (message: RelayReadyMessage | RelayPeerUpdateMessage) => {
        localAttachmentId = message.attachmentId
        await this.options.onPeerAttachments?.(message, selector)
      },
      onCiphertext: async (ciphertext, sourceAttachmentId) => {
        if (localAttachmentId === undefined) throw new Error('Desktop Relay has no local attachment identity')
        await this.options.onCiphertext?.(ciphertext, sourceAttachmentId, localAttachmentId, selector)
      },
    })
    const previous = this.endpoints.get(selector)
    this.endpoints.set(selector, endpoint)
    if (previous !== undefined) void previous.stop('mobile-access-disabled')
  }
  async start(): Promise<void> {
    await Promise.all([...this.endpoints.values()].map(async (endpoint) => { await endpoint.start() }))
    this.stopReason = undefined
  }
  async stop(reason: DesktopRelayStopReason = 'quit'): Promise<void> {
    try {
      await Promise.all([...this.endpoints.values()].map(async (endpoint) => { await endpoint.stop(reason) }))
    } finally { this.stopReason = reason }
  }

  /** @returns observed attachment ownership and the last completed stop reason. */
  getState(): { connected: boolean; stopReason?: DesktopRelayStopReason } {
    return {
      connected: [...this.endpoints.values()].some(endpoint => endpoint.isConnected()),
      ...(this.stopReason === undefined ? {} : { stopReason: this.stopReason }),
    }
  }

  /**
   * Send encrypted Companion Protocol bytes through the owned live attachment.
   * @param pairingSelector - pairing-scoped Desktop authority choosing the physical controller.
   * @param targetAttachmentId - live Mobile attachment.
   * @param ciphertext - bounded encrypted frame.
   */
  async sendCiphertext(
    pairingSelector: RelayPairingSelector,
    targetAttachmentId: RelayAttachmentId,
    ciphertext: Uint8Array,
  ): Promise<void> {
    const endpoint = this.endpoints.get(pairingSelector)
    if (endpoint === undefined) throw new Error('Desktop Relay pairing authority is unavailable')
    await endpoint.sendCiphertext(targetAttachmentId, ciphertext)
  }
}
