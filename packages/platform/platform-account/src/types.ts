import type { Branded } from '@deepseek-ai/dsh-brand'

/** Deployment identity accepted by Platform Account clients. */
export type PlatformEnvironment = 'development' | 'production'

/** Opaque identifier for one Desktop or Mobile app copy. */
export type InstallationId = Branded<'InstallationId'>

/** Opaque Platform Account identifier inside one environment namespace. */
export type PlatformAccountId = Branded<'PlatformAccountId'>

/** Opaque five-minute login-attempt identifier. */
export type LoginAttemptId = Branded<'LoginAttemptId'>

/** Opaque current-installation Account Session identifier. */
export type AccountSessionId = Branded<'AccountSessionId'>

/** Opaque single-use identifier for one installation proof. */
export type AccountProofJti = Branded<'AccountProofJti'>

/** Installation kinds that may own independent Account Sessions. */
export type InstallationKind = 'desktop' | 'mobile'

/** Public account fields retained from GitHub and displayed to the person. */
export interface PlatformAccountView {
  /** Environment-namespaced Platform Account id. */
  id: PlatformAccountId
  /** GitHub's immutable numeric user id. */
  githubId: number
  /** Current public GitHub login, refreshed at successful sign-in. */
  githubLogin: string
  /** Current public avatar URL, refreshed at successful sign-in. */
  avatarUrl: string
}

/** Proof that the installation private key authorized one Account operation. */
export interface AccountProof {
  /** Unique proof id; a successful verification consumes it once. */
  jti: AccountProofJti
  /** Unix epoch milliseconds used for the bounded proof freshness check. */
  issuedAt: number
  /** Base64url P-256/SHA-256 signature in IEEE P1363 form. */
  signature: string
}

/** Login attempt returned before the system browser opens GitHub. */
export interface LoginAttemptView {
  /** Opaque attempt id. */
  id: LoginAttemptId
  /** Random OAuth state returned for diagnostics and callback tests. */
  state: string
  /** GitHub Authorization Code URL carrying S256 PKCE and no scope parameter. */
  authorizationUrl: string
  /** Platform-signed bearer used only to poll this attempt. */
  pollingToken: string
  /** Attempt expiry as Unix epoch milliseconds. */
  expiresAt: number
}

/** Session tokens issued after successful polling or refresh. */
export interface AccountSessionView {
  /** Current installation session id. */
  sessionId: AccountSessionId
  /** Current account projection. */
  account: PlatformAccountView
  /** Fifteen-minute Platform access token bound to the installation key. */
  accessToken: string
  /** Rotating opaque refresh token bound to the installation key. */
  refreshToken: string
  /** Access-token expiry as Unix epoch milliseconds. */
  accessExpiresAt: number
  /** Refresh-token absolute expiry as Unix epoch milliseconds. */
  refreshExpiresAt: number
}

/** Poll result while GitHub authorization is outstanding or complete. */
export type LoginPollResult = { status: 'pending' } | ({ status: 'complete' } & AccountSessionView)

/** Stable Account capability failure codes. */
export type AccountErrorCode =
  | 'LOGIN_ATTEMPT_EXPIRED'
  | 'LOGIN_ATTEMPT_INVALID'
  | 'LOGIN_ATTEMPT_USED'
  | 'LOGIN_STATE_INVALID'
  | 'PROOF_INVALID'
  | 'PROOF_REPLAYED'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
