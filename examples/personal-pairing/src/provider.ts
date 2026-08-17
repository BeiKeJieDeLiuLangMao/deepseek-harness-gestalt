/** Development-only keyless Remote Access provider for the assembled transport example. */

import type { Context } from '@deepseek-ai/cordis'
import { parseInstallationId, parsePlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import {
  PersonalPairingProvider,
  parsePersonalPairingKeyReference,
  type PairingHandshakeProvider,
} from '@deepseek-ai/dsh-remote-access'

/** Cordis name for the keyless provider. */
export const name = 'personal-pairing-keyless-provider'

/** Observable destruction counts emitted by the example runner. */
export const keylessEvidence = { challenges: 0, pending: 0, active: 0 }

/** Assemble the single-process provider with no product cryptography. */
export function apply(ctx: Context): void {
  let key = 0
  const handshake: PairingHandshakeProvider = {
    async createChallenge() {
      return { desktopFingerprint: 'desktop-fingerprint-keyless', state: Uint8Array.of(1) }
    },
    async completeChallenge() {
      return {
        handshakeHash: Uint8Array.from({ length: 32 }, (_, index) => index),
        desktopHandshake: Uint8Array.of(2),
        pendingPairingKey: Uint8Array.of(++key),
      }
    },
    async activatePairing() {
      return { keyReference: parsePersonalPairingKeyReference(`keyless-pairing-key-${String(key)}`) }
    },
    destroyChallenge() { keylessEvidence.challenges += 1 },
    destroyPendingPairing() { keylessEvidence.pending += 1 },
    destroyPairing() { keylessEvidence.active += 1 },
  }
  let id = 0
  new PersonalPairingProvider(ctx, {
    account: {
      async currentInstallation({ accessToken }) {
        const [accountId, kind, installationId] = accessToken.split(':')
        if ((kind !== 'desktop' && kind !== 'mobile') || installationId === undefined || accountId === undefined) {
          throw new TypeError('Keyless Account token is invalid')
        }
        return {
          account: {
            id: parsePlatformAccountId(accountId),
            githubId: 1,
            githubLogin: accountId,
            avatarUrl: 'https://avatars.example/account',
          },
          installation: { id: parseInstallationId(installationId), kind },
        }
      },
    },
    handshake,
    clock: { now: () => Date.parse('2026-08-18T10:00:00.000Z') },
    randomBytes: size => Uint8Array.from({ length: size }, (_, index) => index),
    randomId: kind => `${kind}-${String(++id)}`,
    pairingLinkOrigin: 'https://platform.example.com/pair',
  })
}
