/** Non-production Mobile handshake driver for local keyless controller-flow evidence. */

import { parsePairingCompletionId, type PairingCompletionId } from '@deepseek-ai/dsh-remote-access'
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
}
