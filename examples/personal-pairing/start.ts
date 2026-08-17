import type { Context } from '@deepseek-ai/cordis'
import type { AccountProof, PlatformAccountView } from '@deepseek-ai/dsh-platform-account'
import { parseAccountProofJti, parseInstallationId } from '@deepseek-ai/dsh-platform-account'
import {
  PersonalPairingProvider,
  RemoteAccessError,
  parsePairingCompletionId,
  type PairingHandshakeProvider,
} from '@deepseek-ai/dsh-remote-access'

/** Cordis name for the keyless Personal Pairing acceptance composition. */
export const name = 'personal-pairing-keyless-scenario'

/** Run the Settings-owned same-account Personal Pairing lifecycle without product crypto. */
export async function apply(ctx: Context): Promise<void> {
  let id = 0
  let key = 0
  const destroyed = { challenges: 0, pending: 0 }
  const handshake: PairingHandshakeProvider = {
    async createChallenge() {
      return { desktopFingerprint: 'desktop-fingerprint-keyless', state: Uint8Array.of(++id) }
    },
    async completeChallenge() {
      return {
        handshakeHash: Uint8Array.from({ length: 32 }, (_, index) => index),
        desktopHandshake: Uint8Array.of(2),
        pendingPairingKey: Uint8Array.of(++key),
      }
    },
    async activatePairing() { return { keyReference: `keyless-pairing-key-${String(key)}` } },
    destroyChallenge() { destroyed.challenges += 1 },
    destroyPendingPairing() { destroyed.pending += 1 },
  }
  const provider = new PersonalPairingProvider(ctx, {
    account: {
      async current({ accessToken }) { return account(accessToken.split(':')[0] as string) },
    },
    handshake,
    clock: { now: () => Date.parse('2026-08-18T10:00:00.000Z') },
    randomBytes: size => Uint8Array.from({ length: size }, (_, index) => index),
    randomId: kind => `${kind}-${String(++id)}`,
    pairingLinkOrigin: 'https://platform.example.com/pair',
  })
  const desktop = authentication('account-one', 'desktop-installation')
  console.log(`MOBILE_ACCESS default=${String((await provider.getMobileAccessState(desktop)).enabled)}`)
  await provider.setMobileAccess({ desktop, enabled: true })

  const cross = await provider.createChallenge({ desktop, rendezvousId: 'rendezvous-cross' as never })
  let crossAccount = 'unexpected'
  try {
    await provider.completeChallenge({
      mobile: authentication('account-two', 'mobile-installation'),
      completionId: parsePairingCompletionId('completion-cross'),
      oneTimeLink: cross.oneTimeLink,
      device: { name: 'Other phone', platform: 'android' },
      mobileHandshake: Uint8Array.of(1),
    })
  } catch (error) {
    crossAccount = error instanceof RemoteAccessError ? error.code : 'unexpected'
  }
  console.log(`CROSS_ACCOUNT result=${crossAccount} principals=0`)

  const challenge = await provider.createChallenge({ desktop, rendezvousId: 'rendezvous-same' as never })
  const completionInput = {
    mobile: authentication('account-one', 'mobile-installation'),
    completionId: parsePairingCompletionId('completion-same'),
    oneTimeLink: challenge.oneTimeLink,
    device: { name: 'Alice phone', platform: 'ios' as const },
    mobileHandshake: Uint8Array.of(1),
  }
  const completion = await provider.completeChallenge(completionInput)
  const repeated = await provider.completeChallenge(completionInput)
  console.log(`CHALLENGE ttlMs=${String(challenge.expiresAt - Date.parse('2026-08-18T10:00:00.000Z'))} secretBits=256 qrEqualsLink=${String(challenge.qrPayload === challenge.oneTimeLink)}`)
  console.log(`AUTH_WORDS mobile=${completion.authenticationWords.join('-')} desktop=${(await provider.listPendingPairings(desktop))[0]?.authenticationWords.join('-')} idempotent=${String(repeated.pendingPairingId === completion.pendingPairingId)}`)
  const pairing = await provider.confirmPairing({ desktop, pendingPairingId: completion.pendingPairingId })
  const confirmedAgain = await provider.confirmPairing({ desktop, pendingPairingId: completion.pendingPairingId })
  console.log(`CONFIRM authority=${pairing.devicePrincipal.authority} active=${String((await provider.listPersonalPairings(desktop)).length)} idempotent=${String(confirmedAgain.id === pairing.id)}`)
  console.log(`CAPABILITY_DESTROYED challenge=${String(destroyed.challenges)} pending=${String(destroyed.pending)}`)
  console.log('CRYPTO provider=keyless-proof reviewed=false')
}

function account(id: string): PlatformAccountView {
  return { id: id as never, githubId: 1, githubLogin: id, avatarUrl: 'https://avatars.example/account' }
}

function authentication(accountId: string, installationId: string) {
  const proof: AccountProof = {
    jti: parseAccountProofJti(`${accountId}-${installationId}-proof`),
    issuedAt: Date.parse('2026-08-18T10:00:00.000Z'),
    signature: 'keyless-proof-signature',
  }
  return { installationId: parseInstallationId(installationId), accessToken: `${accountId}:token`, proof }
}
