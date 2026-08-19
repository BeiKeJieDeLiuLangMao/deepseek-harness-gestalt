import { RemoteRelayService } from '@deepseek-ai/dsh-remote-access'

class LoaderRelayProvider extends RemoteRelayService {
  async rotateCredential() { throw new Error('Loader smoke does not rotate Relay credentials') }
  async revokeRoute() { throw new Error('Loader smoke does not revoke Relay routes') }
  async attach() { throw new Error('Loader smoke does not accept Relay attachments') }
}

/** Provide the Relay Service Definition so Loader must honor the WSS plugin injection metadata. */
export function apply(ctx) {
  new LoaderRelayProvider(ctx)
}

/** Cordis name for the Loader-only Relay provider. */
export const name = 'two-instance-relay-loader-provider'
