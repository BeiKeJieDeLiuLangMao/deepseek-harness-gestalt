import type {
  AccountProofJti,
  AccountSessionId,
  AccountSessionView,
  InstallationId,
  LoginAttemptId,
  LoginAttemptView,
  LoginPollResult,
  PlatformAccountId,
  PlatformAccountView,
} from './types.ts'

/**
 * Parse a proof jti at a wire or random-source boundary.
 * @param value - untrusted single-use identifier.
 * @returns branded non-empty proof jti.
 */
export function parseAccountProofJti(value: unknown): AccountProofJti {
  return nonEmptyString(value, 'proof jti') as AccountProofJti
}

/**
 * Parse an installation id at a wire or durable-data boundary.
 * @param value - untrusted identifier value.
 * @returns branded non-empty Installation id.
 */
export function parseInstallationId(value: unknown): InstallationId {
  return nonEmptyString(value, 'installationId') as InstallationId
}

/**
 * Parse a Login Attempt id at a wire or durable-data boundary.
 * @param value - untrusted identifier value.
 * @returns branded non-empty Login Attempt id.
 */
export function parseLoginAttemptId(value: unknown): LoginAttemptId {
  return nonEmptyString(value, 'attemptId') as LoginAttemptId
}

/**
 * Parse a complete public Platform Account projection.
 * @param value - untrusted response value.
 * @returns validated Platform Account projection.
 */
export function parsePlatformAccountView(value: unknown): PlatformAccountView {
  const record = object(value, 'Platform Account')
  const githubId = record.githubId
  if (!Number.isSafeInteger(githubId) || (githubId as number) <= 0) {
    throw new TypeError('Platform Account githubId must be a positive safe integer')
  }
  return {
    id: nonEmptyString(record.id, 'Platform Account id') as PlatformAccountId,
    githubId: githubId as number,
    githubLogin: nonEmptyString(record.githubLogin, 'Platform Account githubLogin'),
    avatarUrl: httpsUrl(record.avatarUrl, 'Platform Account avatarUrl'),
  }
}

/**
 * Parse a complete five-minute login attempt response.
 * @param value - untrusted response value.
 * @returns validated Login Attempt projection.
 */
export function parseLoginAttemptView(value: unknown): LoginAttemptView {
  const record = object(value, 'Login Attempt')
  return {
    id: parseLoginAttemptId(record.id),
    state: nonEmptyString(record.state, 'Login Attempt state'),
    authorizationUrl: httpsUrl(record.authorizationUrl, 'Login Attempt authorizationUrl'),
    pollingToken: nonEmptyString(record.pollingToken, 'Login Attempt pollingToken'),
    expiresAt: epoch(record.expiresAt, 'Login Attempt expiresAt'),
  }
}

/**
 * Parse a complete current-installation Account Session response.
 * @param value - untrusted response or durable value.
 * @returns validated Account Session projection.
 */
export function parseAccountSessionView(value: unknown): AccountSessionView {
  const record = object(value, 'Account Session')
  const accessExpiresAt = epoch(record.accessExpiresAt, 'Account Session accessExpiresAt')
  const refreshExpiresAt = epoch(record.refreshExpiresAt, 'Account Session refreshExpiresAt')
  if (refreshExpiresAt < accessExpiresAt) {
    throw new TypeError('Account Session refresh expiry must not precede access expiry')
  }
  return {
    sessionId: nonEmptyString(record.sessionId, 'Account Session id') as AccountSessionId,
    account: parsePlatformAccountView(record.account),
    accessToken: nonEmptyString(record.accessToken, 'Account Session accessToken'),
    refreshToken: nonEmptyString(record.refreshToken, 'Account Session refreshToken'),
    accessExpiresAt,
    refreshExpiresAt,
  }
}

/**
 * Parse the discriminated polling response without widening its attempt lifecycle.
 * @param value - untrusted polling response.
 * @returns validated pending or complete polling result.
 */
export function parseLoginPollResult(value: unknown): LoginPollResult {
  const record = object(value, 'Login Poll result')
  if (record.status === 'pending') return { status: 'pending' }
  if (record.status === 'complete') return { status: 'complete', ...parseAccountSessionView(record) }
  throw new TypeError('Login Poll status must be pending or complete')
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`)
  }
  return value as Record<string, unknown>
}

function nonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new TypeError(`${name} must be a non-empty string`)
  return value
}

function epoch(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new TypeError(`${name} must be a positive Unix epoch millisecond value`)
  }
  return value as number
}

function httpsUrl(value: unknown, name: string): string {
  const raw = nonEmptyString(value, name)
  const url = new URL(raw)
  if (url.protocol !== 'https:') throw new TypeError(`${name} must use HTTPS`)
  return raw
}
