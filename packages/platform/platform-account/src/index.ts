/**
 * Service Definition for Platform Account identity and current-installation sessions.
 * @module @deepseek-ai/dsh-platform-account
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type {
  AccountProof,
  AccountSessionView,
  AccountSessionId,
  LoginAttemptView,
  LoginPollResult,
  PlatformAccountView,
} from './types.ts'

export * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    platformAccount: AccountService
  }
}

/**
 * Platform Account capability. Providers own OAuth, installation-key binding,
 * token rotation, and current-installation invalidation behind this interface.
 */
export abstract class AccountService extends Service {
  /** @param ctx - Platform composition context receiving this service. */
  constructor(ctx: Context) {
    super(ctx, 'platformAccount')
  }

  /**
   * Start one GitHub Authorization Code attempt for an installation key.
   * @param input - installation identity, kind, and public P-256 JWK.
   * @returns the system-browser URL and signed polling capability.
   */
  abstract beginLogin(input: {
    installationId: string
    installationKind: 'desktop' | 'mobile'
    publicKey: JsonWebKey
  }): Promise<LoginAttemptView>

  /**
   * Settle the fixed HTTPS GitHub callback; provider credentials never leave the provider.
   * @param input - GitHub authorization code and returned random state.
   * @returns completion marker suitable for a browser confirmation page.
   */
  abstract completeGitHubCallback(input: { code: string; state: string }): Promise<{ completed: true }>

  /**
   * Poll one attempt using both its signed polling token and installation proof.
   * @param input - attempt binding and one-use proof.
   * @returns pending or the newly created Account Session.
   */
  abstract pollLogin(input: {
    attemptId: string
    pollingToken: string
    proof: AccountProof
  }): Promise<LoginPollResult>

  /**
   * Rotate a current installation's refresh token and issue a new access token.
   * @param input - current refresh token and installation proof.
   * @returns replacement tokens retaining the original absolute refresh expiry.
   */
  abstract refresh(input: { refreshToken: string; proof: AccountProof }): Promise<AccountSessionView>

  /**
   * Read the current installation account.
   * @param input - access token and installation proof.
   * @returns current account projection.
   */
  abstract current(input: { accessToken: string; proof: AccountProof }): Promise<PlatformAccountView>

  /**
   * Revoke only the current installation Account Session.
   * @param input - access token and installation proof.
   */
  abstract signOut(input: { accessToken: string; proof: AccountProof }): Promise<void>

  /**
   * Track a Platform connection so cross-instance session invalidation closes it.
   * @param sessionId - Account Session owning the connection.
   * @param close - idempotent close callback.
   * @returns disposer removing the tracked connection.
   */
  abstract trackConnection(sessionId: AccountSessionId, close: () => void): () => void
}

export default AccountService
