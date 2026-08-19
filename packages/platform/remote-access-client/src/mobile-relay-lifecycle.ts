import type { RelayCredentialGrant } from '@deepseek-ai/dsh-remote-access'
import { RemoteRelayEndpointController, type RemoteRelayEndpointOptions } from './relay.ts'

/** Mobile-owned Relay lifecycle configured only by authority opened from a confirmed pairing. */
export class MobileRelayEndpointLifecycle {
  private grant: RelayCredentialGrant | undefined
  private readonly endpoint: RemoteRelayEndpointController

  /** @param options - Mobile endpoint adapters other than pairing-delivered route authority. */
  constructor(options: Omit<RemoteRelayEndpointOptions, 'endpoint' | 'route'>) {
    this.endpoint = new RemoteRelayEndpointController({
      ...options,
      endpoint: 'mobile',
      route: () => {
        if (this.grant === undefined) throw new Error('Mobile Relay authority is unavailable')
        return Promise.resolve(this.grant)
      },
    })
  }

  /** Configure the endpoint with Mobile-specific authority opened by the pairing crypto adapter.
   * @param grant - Mobile-specific authority opened by the pairing crypto adapter.
   */
  configure(grant: RelayCredentialGrant): void { this.grant = grant }
  /** Attach after pairing confirmation. */
  async start(): Promise<void> { await this.endpoint.start() }
  /** Stop and drain the current Mobile attachment. */
  async stop(): Promise<void> { await this.endpoint.stop() }
  /** Report whether Platform acknowledged the current attachment.
   * @returns whether Platform acknowledged the current attachment.
   */
  isConnected(): boolean { return this.endpoint.isConnected() }
}
