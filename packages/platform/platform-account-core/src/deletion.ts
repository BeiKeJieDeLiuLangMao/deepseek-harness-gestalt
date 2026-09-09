/** Durable account-deletion records and product cleanup obligations. */
import { parseAccountDeletionView, parseAccountDeletionSuccessors, parsePlatformAccountId, parseInstallationId, parseAccountSessionId } from '@deepseek-ai/dsh-platform-account'
import type {
  AccountDeletionId,
  AccountDeletionProject,
  AccountDeletionSuccessor,
  AccountDeletionView,
  AccountSessionId,
  InstallationId,
  PlatformAccountId,
} from '@deepseek-ai/dsh-platform-account'

/** Account metadata retained only while deletion cleanup still needs its identity. */
export interface AccountDeletionRecord {
  /** Stable operation identity retained across retries. */
  operationId: AccountDeletionId
  /** Account whose authority is revoked and data is cleaned. */
  accountId: PlatformAccountId
  /** Environment namespace that owns this deletion. */
  identityNamespace: string
  /** Installation that confirmed deletion. */
  installationId: InstallationId
  /** Public P-256 key required for recovery proof verification. */
  publicKey: JsonWebKey
  /** Digest of the initiating Installation recovery token. */
  recoveryTokenHash: string
  /** Explicit joined-member ownership transfers approved by the Account. */
  successors: readonly AccountDeletionSuccessor[]
  /** Revoked sessions whose connections require invalidation. */
  sessionIds: readonly AccountSessionId[]
  /** Durable cleanup progress; complete requires every owner to finish. */
  status: AccountDeletionView['status']
  /** Shared projects requiring replacement successor choices. */
  projects: readonly AccountDeletionProject[]
  /** Completion time in milliseconds; absent until all cleanup finishes. */
  completedAt?: number
}

/** Existing product owners revoke access and erase their account-owned data. */
export interface AccountDeletionOwner {
  /** Return current sole-owner projects and joined successor candidates. */
  plan(accountId: PlatformAccountId): Promise<readonly AccountDeletionProject[]>
  /** Idempotently revoke pairing, route and attachment access before slow cleanup. */
  revoke(accountId: PlatformAccountId): Promise<void>
  /** Finish cleanup, or return projects whose successor choices need replacement. */
  cleanup(accountId: PlatformAccountId, successors: readonly AccountDeletionSuccessor[]): Promise<readonly AccountDeletionProject[]>
}

/** Explicit operational budgets and the product's existing data owners. */
export interface AccountDeletionOptions {
  /** Product owners responsible for access revocation and data cleanup. */
  owner: AccountDeletionOwner
  /** Interval for retrying unfinished deletion after process recovery. */
  retryIntervalMs: number
  /** Time completed recovery receipts remain queryable before erasure. */
  completedReceiptLifetimeMs: number
}

/**
 * Parse a persisted deletion record before cleanup or proof verification.
 * @param value - Untrusted JSON read from the durable backend.
 * @returns Complete deletion state with validated identities and progress.
 */
export function parseAccountDeletionRecord(value: unknown): AccountDeletionRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Account deletion record must be an object')
  const record = value as Record<string, unknown>
  const view = parseAccountDeletionView(record)
  if (typeof record.identityNamespace !== 'string' || record.identityNamespace.trim() === '') throw new TypeError('Deletion namespace is required')
  if (typeof record.recoveryTokenHash !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(record.recoveryTokenHash)) throw new TypeError('Deletion recovery digest is invalid')
  if (record.publicKey === null || typeof record.publicKey !== 'object' || Array.isArray(record.publicKey)) throw new TypeError('Deletion public key is required')
  const key = record.publicKey as JsonWebKey
  if (key.kty !== 'EC' || key.crv !== 'P-256' || typeof key.x !== 'string' || typeof key.y !== 'string' || key.d !== undefined) throw new TypeError('Deletion public key must be public P-256')
  if (!Array.isArray(record.sessionIds)) throw new TypeError('Deletion session ids must be an array')
  if (record.completedAt !== undefined && (!Number.isSafeInteger(record.completedAt) || Number(record.completedAt) < 0)) throw new TypeError('Deletion completion timestamp is invalid')
  if ((view.status === 'complete') !== (record.completedAt !== undefined)) throw new TypeError('Deletion completion status and timestamp disagree')
  return {
    ...view, accountId: parsePlatformAccountId(record.accountId),
    identityNamespace: record.identityNamespace,
    installationId: parseInstallationId(record.installationId),
    publicKey: key, recoveryTokenHash: record.recoveryTokenHash,
    successors: parseAccountDeletionSuccessors(record.successors),
    sessionIds: record.sessionIds.map((id: unknown) => parseAccountSessionId(id)),
    ...(record.completedAt === undefined ? {} : { completedAt: Number(record.completedAt) }),
  }
}
