/** Wire and durable identities for account deletion, independent of revoked Account Sessions. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { AccountProof } from './types.ts'

/** One client-created, recoverable account deletion operation. */
export type AccountDeletionId = Branded<'AccountDeletionId'>
/** Project identity selected through the deletion owner. */
export type AccountDeletionProjectId = Branded<'ProjectId'>
/** Joined membership eligible to receive project ownership. */
export type AccountDeletionMembershipId = Branded<'MembershipId'>

/** Explicit ownership transfer authorized by the deleting Account. */
export interface AccountDeletionSuccessor {
  projectId: AccountDeletionProjectId
  successorMembershipId: AccountDeletionMembershipId
}

/** Installation-owned material persisted before transmitting a deletion request. */
export interface AccountDeletionReceipt {
  operationId: AccountDeletionId
  recoveryToken: string
}

/** Confirmed deletion bound to the active Installation and selected successors. */
export interface AccountDeletionRequest extends AccountDeletionReceipt {
  accessToken: string
  successors: readonly AccountDeletionSuccessor[]
  proof: AccountProof
}

/** Progress available without ordinary Account authorization. */
export interface AccountDeletionView {
  operationId: AccountDeletionId
  status: 'deleting' | 'action-required' | 'complete'
  /** Shared projects requiring explicit replacement selections. */
  projects: readonly AccountDeletionProject[]
}

/**
 * Parse a deletion identifier at a wire, random-source or persistence boundary.
 * @param value - Untrusted operation identifier.
 * @returns Bounded deletion identifier.
 */
export function parseAccountDeletionId(value: unknown): AccountDeletionId {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/u.test(value)) {
    throw new TypeError('Account deletion id must contain 1-128 identifier characters')
  }
  return value as AccountDeletionId
}

/**
 * Serialize all deletion choices into the Installation proof binding.
 * @param input - Operation identifier, recovery-token digest and explicit successor choices.
 * @returns Canonical binding suffix; callers prefix the access-token digest when starting deletion.
 */
export function accountDeletionBinding(input: {
  operationId: AccountDeletionId
  recoveryTokenHash: string
  successors: readonly AccountDeletionSuccessor[]
}): string {
  return JSON.stringify([input.operationId, input.recoveryTokenHash,
    input.successors.map(choice => [choice.projectId, choice.successorMembershipId])])
}

/** Joined member displayed as an explicit ownership successor. */
export interface AccountDeletionCandidate {
  membershipId: AccountDeletionMembershipId
  accountId: import('./types.ts').PlatformAccountId
  label: string
}

/** Shared project that requires a successor before its sole owner can be deleted. */
export interface AccountDeletionProject {
  projectId: AccountDeletionProjectId
  name: string
  candidates: readonly AccountDeletionCandidate[]
}

/** Recovery request signed by the initiating Installation key. */
export interface AccountDeletionRecovery extends AccountDeletionReceipt {
  proof: AccountProof
  /** Present only when replacing ownership choices after an action-required result. */
  successors?: readonly AccountDeletionSuccessor[]
}

/**
 * Validate explicit successor choices received over HTTP or from durable storage.
 * @param value - Untrusted successor list.
 * @returns Unique project selections with branded identifiers.
 */
export function parseAccountDeletionSuccessors(value: unknown): readonly AccountDeletionSuccessor[] {
  if (!Array.isArray(value)) throw new TypeError('Account deletion successors must be an array')
  const seen = new Set<string>()
  return value.map((entry: unknown) => {
    const record = deletionObject(entry)
    const projectId = deletionString(record.projectId, 'project id') as AccountDeletionProjectId
    const successorMembershipId = deletionString(record.successorMembershipId, 'successor membership id') as AccountDeletionMembershipId
    if (seen.has(projectId)) throw new TypeError('Account deletion successor projects must be unique')
    seen.add(projectId)
    return { projectId, successorMembershipId }
  })
}

/**
 * Validate deletion planning projections from the server or a recovery record.
 * @param value - Untrusted project and joined-member candidates.
 * @returns Branded, bounded presentation values.
 */
export function parseAccountDeletionProjects(value: unknown): readonly AccountDeletionProject[] {
  if (!Array.isArray(value)) throw new TypeError('Account deletion projects must be an array')
  const projectIds = new Set<string>()
  return value.map((entry: unknown) => {
    const record = deletionObject(entry)
    const projectId = deletionString(record.projectId, 'project id') as AccountDeletionProjectId
    if (projectIds.has(projectId)) throw new TypeError('Account deletion projects must be unique')
    projectIds.add(projectId)
    if (!Array.isArray(record.candidates)) throw new TypeError('Account deletion candidates must be an array')
    const membershipIds = new Set<string>()
    const candidates = record.candidates.map((candidate: unknown) => {
      const member = deletionObject(candidate)
      const membershipId = deletionString(member.membershipId, 'membership id') as AccountDeletionMembershipId
      if (membershipIds.has(membershipId)) throw new TypeError('Account deletion candidates must be unique')
      membershipIds.add(membershipId)
      return { membershipId,
        accountId: deletionString(member.accountId, 'account id') as import('./types.ts').PlatformAccountId,
        label: deletionString(member.label, 'member label'),
      }
    })
    return { projectId, name: deletionString(record.name, 'project name'), candidates }
  })
}

/**
 * Validate server deletion progress before exposing it to the product.
 * @param value - Untrusted response or persisted view.
 * @returns Known deletion status and required replacement projects.
 */
export function parseAccountDeletionView(value: unknown): AccountDeletionView {
  const record = deletionObject(value)
  if (record.status !== 'deleting' && record.status !== 'action-required' && record.status !== 'complete') {
    throw new TypeError('Account deletion status is invalid')
  }
  const projects = parseAccountDeletionProjects(record.projects)
  if (record.status !== 'action-required' && projects.length > 0) throw new TypeError('Only action-required deletion exposes projects')
  return { operationId: parseAccountDeletionId(record.operationId), status: record.status, projects }
}

/**
 * Validate the random bearer used only with the initiating Installation proof.
 * @param value - Untrusted recovery token.
 * @returns A 256-bit base64url token.
 */
export function parseAccountDeletionRecoveryToken(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(value)) throw new TypeError('Account deletion recovery token must encode 32 random bytes')
  return value
}

function deletionObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Account deletion value must be an object')
  return value as Record<string, unknown>
}

function deletionString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 1024) throw new TypeError(`Account deletion ${name} must be non-empty and bounded`)
  return value
}
