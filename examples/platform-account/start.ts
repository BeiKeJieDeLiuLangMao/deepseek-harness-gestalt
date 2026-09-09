import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import {
  parseAccountProofJti,
  parseAccountDeletionId,
  accountDeletionBinding,
  mobileInstallationRevocationBinding,
  AccountError,
  ACCOUNT_PRIVACY_NOTICE,
  parseInstallationId,
  selectPlatformEnvironment,
  validatePlatformEnvironmentPair,
  type AccountProof,
  type AccountSessionView,
} from '@deepseek-ai/dsh-platform-account'
import {
  MemoryAccountBackend,
  MemoryAccountInvalidationBus,
  PlatformAccount,
  type GitHubIdentityProvider,
} from '@deepseek-ai/dsh-platform-account-core'

/** Cordis name for the keyless Account acceptance composition. */
export const name = 'platform-account-keyless-scenario'

/** Run the complete Account lifecycle while the real Loader activates this plugin. */
export async function apply(ctx: Context): Promise<void> {
  const now = Date.parse('2026-08-17T10:00:00.000Z')
  const environment = selectPlatformEnvironment(validatePlatformEnvironmentPair({
    development: {
      environment: 'development',
      origin: 'https://platform.dev.example.com',
      callbackUrl: 'https://platform.dev.example.com/v1/account/oauth/github/callback',
      githubClientId: 'keyless-development',
      credentialReference: 'credentials://platform-account/development/github-oauth-app',
      databaseIdentity: 'keyless-database-development',
      identityNamespace: 'keyless-development',
    },
    production: {
      environment: 'production',
      origin: 'https://platform.example.com',
      callbackUrl: 'https://platform.example.com/v1/account/oauth/github/callback',
      githubClientId: 'keyless-production',
      credentialReference: 'credentials://platform-account/production/github-oauth-app',
      databaseIdentity: 'keyless-database-production',
      identityNamespace: 'keyless-production',
    },
  }), 'development')
  const backend = new MemoryAccountBackend(environment.databaseIdentity)
  const invalidation = new MemoryAccountInvalidationBus()
  let callback: { code: string; state: string } | undefined
  const github: GitHubIdentityProvider = {
    environment,
    authorizationUrl(input) {
      callback = { code: 'keyless-github-code', state: input.state }
      const url = new URL('https://github.com/login/oauth/authorize')
      url.searchParams.set('client_id', 'keyless-development')
      url.searchParams.set('redirect_uri', input.callbackUrl)
      url.searchParams.set('state', input.state)
      url.searchParams.set('code_challenge', input.codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      return url.toString()
    },
    async exchange() {
      return { providerSubject: 13994321, login: 'octocat', avatarUrl: 'https://avatars.example/octocat' }
    },
  }
  const config = {
    tokenSigningKey: Buffer.alloc(32, 1),
    pollingSigningKey: Buffer.alloc(32, 2),
    sessionInvalidationRetryIntervalMs: 60_000,
  }
  let cleanupAvailable = false
  const deletion = { retryIntervalMs: 60_000, completedReceiptLifetimeMs: 60_000,
    owner: { async plan() { return [] }, async revoke() {}, async cleanup() {
      if (!cleanupAvailable) throw new Error('cleanup temporarily unavailable')
      return []
    } } }
  const first = new PlatformAccount(ctx, {
    backend, invalidation, github, environment, config, deletion, clock: { now: () => now },
  })
  const second = new PlatformAccount(new Context(), {
    backend, invalidation, github, environment, config, deletion, clock: { now: () => now },
  })

  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  console.log('PRIVACY zh+en before authorization')
  console.log(`NOTICE zh=${ACCOUNT_PRIVACY_NOTICE.zh}`)
  console.log(`NOTICE en=${ACCOUNT_PRIVACY_NOTICE.en}`)
  const attempt = await first.beginLogin({
    installationId: parseInstallationId('desktop-keyless-1'),
    installationKind: 'desktop', presentation: { name: 'Test Desktop', platform: 'linux' as const },
    publicKey: pair.publicKey.export({ format: 'jwk' }),
  })
  const opened = attempt.authorizationUrl
  console.log(`AUTHORIZE system-browser=${new URL(opened).origin} scope=${new URL(opened).searchParams.has('scope') ? 'requested' : 'none'} pkce=${new URL(opened).searchParams.get('code_challenge_method')}`)
  if (callback === undefined) throw new Error('keyless provider did not receive an authorization URL')
  await first.completeGitHubCallback(callback)
  const polled = await second.pollLogin({
    attemptId: attempt.id,
    pollingToken: attempt.pollingToken,
    proof: proof(pair.privateKey, 'login-poll', `${attempt.id}:${hash(attempt.pollingToken)}`, now),
  })
  if (polled.status !== 'complete') throw new Error('keyless login did not complete')
  const session: AccountSessionView = polled
  console.log(`ACCOUNT githubId=${String(session.account.githubId)} login=${session.account.githubLogin}`)
  console.log(`SESSION accessMinutes=${String((session.accessExpiresAt - now) / 60_000)} refreshDays=${String((session.refreshExpiresAt - now) / 86_400_000)}`)
  const mobilePair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const mobileAttempt = await first.beginLogin({
    installationId: parseInstallationId('mobile-keyless-1'),
    installationKind: 'mobile',
    presentation: { name: 'Keyless iPhone', platform: 'ios' },
    publicKey: mobilePair.publicKey.export({ format: 'jwk' }),
  })
  await first.completeGitHubCallback(callback)
  const mobile = await first.pollLogin({
    attemptId: mobileAttempt.id,
    pollingToken: mobileAttempt.pollingToken,
    proof: proof(mobilePair.privateKey, 'login-poll', `${mobileAttempt.id}:${hash(mobileAttempt.pollingToken)}`, now),
  })
  if (mobile.status !== 'complete') throw new Error('keyless Mobile login did not complete')
  const installations = await first.listMobileInstallations({
    accessToken: session.accessToken,
    proof: proof(pair.privateKey, 'list-mobile-installations', hash(session.accessToken), now),
  })
  const listedMobile = installations[0]
  if (listedMobile === undefined) throw new Error('keyless Mobile Installation was not listed')
  console.log(`MOBILE_LIST count=${String(installations.length)} name=${listedMobile.name} platform=${listedMobile.platform} reference=${listedMobile.reference}`)
  let mobileClosed = false
  await second.trackConnection(mobile.sessionId, () => { mobileClosed = true })
  const remaining = await first.revokeMobileInstallation({
    accessToken: session.accessToken,
    installationId: listedMobile.id,
    proof: proof(
      pair.privateKey,
      'revoke-mobile-installation',
      mobileInstallationRevocationBinding(hash(session.accessToken), listedMobile.id),
      now,
    ),
  })
  console.log(`MOBILE_REMOVE remaining=${String(remaining.length)} crossInstanceClosed=${String(mobileClosed)}`)
  const reloginAttempt = await first.beginLogin({
    installationId: listedMobile.id,
    installationKind: 'mobile',
    presentation: { name: 'Keyless iPhone', platform: 'ios' },
    publicKey: mobilePair.publicKey.export({ format: 'jwk' }),
  })
  await first.completeGitHubCallback(callback)
  const relogin = await first.pollLogin({
    attemptId: reloginAttempt.id,
    pollingToken: reloginAttempt.pollingToken,
    proof: proof(mobilePair.privateKey, 'login-poll', `${reloginAttempt.id}:${hash(reloginAttempt.pollingToken)}`, now),
  })
  console.log(`MOBILE_RELOGIN sameInstallation=${String(relogin.status === 'complete')}`)
  let desktopClosed = false
  await second.trackConnection(session.sessionId, () => { desktopClosed = true })
  await first.signOut({
    accessToken: session.accessToken,
    proof: proof(pair.privateKey, 'sign-out', hash(session.accessToken), now),
  })
  console.log(`SIGN_OUT crossInstanceClosed=${String(desktopClosed)} local=idle`)
  const deletingAttempt = await first.beginLogin({ installationId: parseInstallationId('deleting-mobile'),
    installationKind: 'mobile', presentation: { name: 'Deleting Mobile', platform: 'ios' }, publicKey: pair.publicKey.export({ format: 'jwk' }) })
  await first.completeGitHubCallback(callback)
  const deletingSession = await first.pollLogin({ attemptId: deletingAttempt.id, pollingToken: deletingAttempt.pollingToken,
    proof: proof(pair.privateKey, 'login-poll', `${deletingAttempt.id}:${hash(deletingAttempt.pollingToken)}`, now) })
  if (deletingSession.status !== 'complete') throw new Error('Deletion installation login did not complete')
  const operationId = parseAccountDeletionId(randomUUID())
  const recoveryToken = createHash('sha256').update(randomUUID()).digest('base64url')
  const binding = accountDeletionBinding({ operationId, recoveryTokenHash: hash(recoveryToken), successors: [] })
  const accepted = await first.deleteAccount({ operationId, recoveryToken, successors: [], accessToken: deletingSession.accessToken,
    proof: proof(pair.privateKey, 'delete-account', `${hash(deletingSession.accessToken)}:${binding}`, now) })
  console.log(`DELETE accepted=${accepted.status}`)
  try {
    await second.current({ accessToken: deletingSession.accessToken, proof: proof(pair.privateKey, 'current', hash(deletingSession.accessToken), now) })
    throw new Error('Deleted Account Session remained authorized')
  } catch (error) {
    if (!(error instanceof AccountError) || error.code !== 'SESSION_REVOKED') throw error
    console.log(`DELETE ordinaryAuthorization=${error.code}`)
  }
  cleanupAvailable = true
  const recovered = await second.recoverAccountDeletion({ operationId, recoveryToken,
    proof: proof(pair.privateKey, 'recover-account-deletion', binding, now) })
  console.log(`DELETE installationProofRecovery=${recovered.status}`)
  await first.dispose()
  await second.dispose()
}

function proof(
  privateKey: import('node:crypto').KeyObject,
  operation: string,
  binding: string,
  issuedAt: number,
): AccountProof {
  const jti = parseAccountProofJti(randomUUID())
  return {
    jti,
    issuedAt,
    signature: sign('sha256', Buffer.from(`${operation}\n${binding}\n${issuedAt}\n${jti}`), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url'),
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}
