import type { RelayAttachmentId } from '@deepseek-ai/dsh-remote-protocol'
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
  private grant: RelayCredentialGrant | undefined
  private readonly endpoint: RemoteRelayEndpointController

  /** @param options - Desktop endpoint adapters other than route authority. */
  constructor(options: Omit<RemoteRelayEndpointOptions, 'endpoint' | 'route'>) {
    this.endpoint = new RemoteRelayEndpointController({
      ...options,
      endpoint: 'desktop',
      route: async () => {
        if (this.grant === undefined) throw new Error('Desktop Relay authority is unavailable')
        return this.grant
      },
    })
  }

  configure(grant: RelayCredentialGrant): void { this.grant = grant }
  async start(): Promise<void> { await this.endpoint.start() }
  async stop(reason: DesktopRelayStopReason = 'quit'): Promise<void> { await this.endpoint.stop(reason) }

  /**
   * Send encrypted Companion Protocol bytes through the owned live attachment.
   * @param targetAttachmentId - live Mobile attachment.
   * @param ciphertext - bounded encrypted frame.
   */
  async sendCiphertext(targetAttachmentId: RelayAttachmentId, ciphertext: Uint8Array): Promise<void> {
    await this.endpoint.sendCiphertext(targetAttachmentId, ciphertext)
  }
}
