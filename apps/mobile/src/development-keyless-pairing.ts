/** Non-production Mobile handshake driver for local keyless controller-flow evidence. */

import {
  parsePairingCompletionId,
  type PairingCompletionId,
  type RelayCredentialGrant,
} from '@deepseek-ai/dsh-remote-access'
import { parseRelayCredential, parseRelayRouteId } from '@deepseek-ai/dsh-remote-protocol'
import type { MobilePairingHandshakeClient } from './personal-pairing.ts'

/** Explicit development-only handshake driver; it provides no cryptographic security. */
export class DevelopmentKeylessMobileHandshakeClient implements MobilePairingHandshakeClient {
  begin(_oneTimeLink: string): Promise<{ completionId: PairingCompletionId; mobileHandshake: Uint8Array }> {
    return Promise.resolve({
      completionId: parsePairingCompletionId(`development-${crypto.randomUUID()}`),
      mobileHandshake: Uint8Array.of(0),
    })
  }

  acceptDesktopHandshake(_desktopHandshake: Uint8Array): Promise<void> { return Promise.resolve() }

  openRelayAuthority(sealedAuthority: Uint8Array): Promise<RelayCredentialGrant> {
    return Promise.resolve().then(() => {
      const value = JSON.parse(new TextDecoder().decode(sealedAuthority)) as unknown
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError('Development Relay authority must be an object')
      }
      const record = value as Record<string, unknown>
      if (record.endpoint !== 'mobile') {
        throw new TypeError('Development Relay authority endpoint must be mobile')
      }
      if (!Number.isSafeInteger(record.revision) || (record.revision as number) <= 0) {
        throw new TypeError('Development Relay authority revision must be positive')
      }
      return {
        endpoint: 'mobile',
        routeId: parseRelayRouteId(record.routeId),
        credential: parseRelayCredential(record.credential),
        revision: record.revision as number,
      }
    })
  }
}
