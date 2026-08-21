/** Production-only listen-process and deploy Environment names. */

/** Names the listen process must receive from Environment `production`. */
export const PLATFORM_PRODUCTION_REQUIRED_ENV = [
  'PLATFORM_ORIGIN',
  'PLATFORM_GITHUB_CLIENT_ID',
  'PLATFORM_GITHUB_CLIENT_SECRET',
  'PLATFORM_GITHUB_CALLBACK',
  'PLATFORM_POSTGRES_HOST',
  'PLATFORM_POSTGRES_USER',
  'PLATFORM_POSTGRES_PASSWORD',
  'PLATFORM_REDIS_HOST',
  'PLATFORM_REDIS_PASSWORD',
  'PLATFORM_TOKEN_SIGNING_KEY',
  'PLATFORM_POLLING_SIGNING_KEY',
  'PLATFORM_RELAY_ATTACH_TIMEOUT_MS',
  'PLATFORM_RELAY_CAPACITY_RETRY_AFTER_MS',
  'PLATFORM_RELAY_DELIVERY_ACK_TIMEOUT_MS',
  'PLATFORM_RELAY_DIRECTORY_TTL_MS',
  'PLATFORM_RELAY_HEARTBEAT_TIMEOUT_MS',
  'PLATFORM_RELAY_MAX_BUFFERED_CIPHERTEXT_BYTES',
  'PLATFORM_RELAY_MAX_CONNECTIONS',
  'PLATFORM_RELAY_MAX_PENDING_DELIVERIES',
] as const

/** Listen-process names plus the ECS apply names. */
export const PLATFORM_DEPLOY_REQUIRED_ENV = [
  ...PLATFORM_PRODUCTION_REQUIRED_ENV,
  'PLATFORM_ECS_SSH_KEY',
  'PLATFORM_ECS_HOSTS',
] as const

/** A required production or deploy Environment name. */
export type PlatformDeployEnvName = (typeof PLATFORM_DEPLOY_REQUIRED_ENV)[number]

const SIGNING_KEY_NAMES = ['PLATFORM_TOKEN_SIGNING_KEY', 'PLATFORM_POLLING_SIGNING_KEY'] as const

/** A 32-byte hex signing-key name. */
export type PlatformSigningKeyName = (typeof SIGNING_KEY_NAMES)[number]

/**
 * Reports required names that are unset or empty.
 * @param names - Environment names to inspect
 * @param env - Process environment to inspect
 * @returns Missing names in declaration order
 */
export function missingPlatformEnv(
  names: readonly string[],
  env: NodeJS.Dict<string> = process.env,
): string[] {
  return names.filter((name) => {
    const value = env[name]
    return value === undefined || value === ''
  })
}

/**
 * Reports listen-process names that are unset or empty.
 * @param env - Process environment to inspect
 * @returns Missing names in declaration order
 */
export function missingPlatformProductionEnv(env: NodeJS.Dict<string> = process.env): string[] {
  return missingPlatformEnv(PLATFORM_PRODUCTION_REQUIRED_ENV, env)
}

/**
 * Reports deploy names that are unset or empty.
 * @param env - Process environment to inspect
 * @returns Missing names in declaration order
 */
export function missingPlatformDeployEnv(env: NodeJS.Dict<string> = process.env): string[] {
  return missingPlatformEnv(PLATFORM_DEPLOY_REQUIRED_ENV, env)
}

/**
 * Reads one required production or deploy name.
 * @param name - Environment name
 * @param env - Process environment to inspect
 * @returns The non-empty value
 */
export function requiredPlatformEnv(
  name: PlatformDeployEnvName,
  env: NodeJS.Dict<string> = process.env,
): string {
  const value = env[name]
  if (value === undefined || value === '') {
    throw new Error(`platform: missing deployment secrets: ${name}`)
  }
  return value
}

/**
 * Reads a 32-byte hex signing key.
 * @param name - Token or polling signing-key name
 * @param env - Process environment to inspect
 * @returns 32 raw key bytes
 */
export function readPlatformSigningKey(
  name: PlatformSigningKeyName,
  env: NodeJS.Dict<string> = process.env,
): Uint8Array {
  const hex = requiredPlatformEnv(name, env)
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new TypeError(`${name} must be 32 bytes of hex`)
  }
  return Uint8Array.from(Buffer.from(hex, 'hex'))
}

/**
 * Reads one required positive integer name.
 * @param name - Relay tunable name
 * @param env - Process environment to inspect
 * @returns the positive integer
 */
export function readPositiveIntegerPlatformEnv(
  name: PlatformDeployEnvName,
  env: NodeJS.Dict<string> = process.env,
): number {
  const raw = requiredPlatformEnv(name, env)
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`)
  }
  return value
}

/**
 * Accepts only the operated production selection.
 * @param selection - `PLATFORM_ENVIRONMENT` or an explicit selection
 * @returns `production`
 */
export function assertOperatedPlatformEnvironment(
  selection: string | undefined = process.env.PLATFORM_ENVIRONMENT,
): 'production' {
  if (selection === undefined || selection === '' || selection === 'production') {
    return 'production'
  }
  throw new Error(`platform: operated listen process accepts only production, got ${JSON.stringify(selection)}`)
}

/**
 * Prints missing deploy names without values and checks signing-key hex.
 * @param env - Process environment to inspect
 * @returns Process exit status
 */
export function runPlatformProductionEnvCli(env: NodeJS.Dict<string> = process.env): number {
  const missing = missingPlatformDeployEnv(env)
  if (missing.length > 0) {
    console.error(`platform: missing deployment secrets: ${missing.join(', ')}`)
    return 1
  }
  try {
    assertOperatedPlatformEnvironment(env.PLATFORM_ENVIRONMENT)
    readPlatformSigningKey('PLATFORM_TOKEN_SIGNING_KEY', env)
    readPlatformSigningKey('PLATFORM_POLLING_SIGNING_KEY', env)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    return 1
  }
  return 0
}
