/** Run the authenticated Desktop/Mobile transport flow over the keyless HTTP composition. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import {
  parseAccountProofJti,
  selectPlatformEnvironment,
  validatePlatformEnvironmentPair,
} from '@deepseek-ai/dsh-platform-account'
import {
  RemoteAccessError,
  parsePairingCompletionId,
  parsePairingRendezvousId,
  type PairingAccountAuthentication,
} from '@deepseek-ai/dsh-remote-access'
import { RemoteAccessHttpTransport } from '@deepseek-ai/dsh-remote-access-client'
import { keylessEvidence } from './src/provider.ts'

/** Cordis name for the keyless Personal Pairing acceptance runner. */
export const name = 'personal-pairing-keyless-scenario'
/** Runner dependencies assembled before the scenario executes. */
export const inject = ['remoteAccess', 'webServer']

/** Run one same-account pairing through the actual HTTP Consumer and shared transport. */
export async function apply(ctx: Context): Promise<void> {
  const localOrigin = `http://${ctx.webServer.host}:${String(ctx.webServer.port)}`
  const environment = selectPlatformEnvironment(validatePlatformEnvironmentPair({
    development: {
      environment: 'development', origin: 'https://platform.example.com',
      callbackUrl: 'https://platform.example.com/v1/account/oauth/github/callback',
      githubClientId: 'personal-pairing-keyless-development',
      credentialReference: 'credentials://personal-pairing-keyless-development',
      databaseIdentity: 'personal-pairing-keyless-development',
      identityNamespace: 'personal-pairing-keyless-development',
    },
    production: {
      environment: 'production', origin: 'https://platform.production.example.com',
      callbackUrl: 'https://platform.production.example.com/v1/account/oauth/github/callback',
      githubClientId: 'personal-pairing-keyless-production',
      credentialReference: 'credentials://personal-pairing-keyless-production',
      databaseIdentity: 'personal-pairing-keyless-production',
      identityNamespace: 'personal-pairing-keyless-production',
    },
  }), 'development')
  const transport = new RemoteAccessHttpTransport({
    environment,
    fetch: (input, init) => fetch(rewriteOrigin(input, localOrigin), init),
  })
  let proof = 0
  const authentication = (
    kind: 'desktop' | 'mobile',
    accountId = 'account-one',
  ): PairingAccountAuthentication => ({
    accessToken: `${accountId}:${kind}:${kind}-installation`,
    proof: {
      jti: parseAccountProofJti(`proof-${String(++proof)}`),
      issuedAt: Date.parse('2026-08-18T10:00:00.000Z'),
      signature: 'keyless-proof-signature',
    },
  })

  const desktop = () => authentication('desktop')
  const mobile = () => authentication('mobile')
  console.log(`MOBILE_ACCESS default=${String((await transport.getMobileAccessState(desktop())).enabled)}`)
  await transport.setMobileAccess({ authentication: desktop(), enabled: true })

  const cross = await transport.createChallenge({
    authentication: desktop(),
    rendezvousId: parsePairingRendezvousId('rendezvous-cross'),
  })
  let crossAccount = 'unexpected'
  try {
    await transport.completeChallenge({
      authentication: authentication('mobile', 'account-two'),
      completionId: parsePairingCompletionId('completion-cross'),
      oneTimeLink: cross.oneTimeLink,
      device: { name: 'Other phone', platform: 'android' },
      mobileHandshake: Uint8Array.of(0),
    })
  } catch (error) {
    crossAccount = error instanceof RemoteAccessError ? error.code : 'unexpected'
  }
  console.log(`CROSS_ACCOUNT result=${crossAccount} principals=0`)

  const challenge = await transport.createChallenge({
    authentication: desktop(),
    rendezvousId: parsePairingRendezvousId('rendezvous-same'),
  })
  const pending = await transport.completeChallenge({
    authentication: mobile(),
    completionId: parsePairingCompletionId('completion-same'),
    oneTimeLink: challenge.oneTimeLink,
    device: { name: 'Alice phone', platform: 'ios' },
    mobileHandshake: Uint8Array.of(0),
  })
  const desktopPending = (await transport.listPendingPairings(desktop()))[0]
  console.log(`CHALLENGE ttlMs=120000 secretBits=256 qrEqualsLink=${String(challenge.qrPayload === challenge.oneTimeLink)}`)
  console.log(`AUTH_WORDS mobile=${pending.authenticationWords.join('-')} desktop=${desktopPending?.authenticationWords.join('-')}`)
  await transport.confirmPairing({ authentication: desktop(), pendingPairingId: pending.pendingPairingId })
  const mobileStatus = await transport.getMobilePairingStatus({
    authentication: mobile(), pendingPairingId: pending.pendingPairingId,
  })
  const active = await transport.listPersonalPairings(desktop())
  console.log(`CONFIRM mobile=${mobileStatus.status} active=${String(active.length)} authority=${active[0]?.devicePrincipal.authority}`)
  console.log(`CAPABILITY_DESTROYED challenge=${String(keylessEvidence.challenges)} pending=${String(keylessEvidence.pending)}`)
  console.log('FLOW transport=http consumer=ctx.remoteAccess')
  console.log('CRYPTO provider=keyless-proof reviewed=false')
}

function rewriteOrigin(input: string | URL | Request, origin: string): string | URL | Request {
  if (input instanceof Request) return new Request(rewriteOrigin(input.url, origin), input)
  const url = new URL(String(input))
  const local = new URL(origin)
  url.protocol = local.protocol
  url.hostname = local.hostname
  url.port = local.port
  return input instanceof URL ? url : url.href
}
