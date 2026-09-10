/** Product-owned cleanup ordering for one accepted Platform Account deletion. */
import type { AccountDeletionOwner } from '@deepseek-ai/dsh-platform-account-core'
import { parsePlatformAccountId, type PlatformAccountId, type AccountService } from '@deepseek-ai/dsh-platform-account'
import type { ProjectMembershipService } from '@deepseek-ai/dsh-project-membership'
import type { PersonalPairingComposition, PersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import { RemoteAttachmentError } from '@deepseek-ai/dsh-remote-attachments'
import type { PostgresPersonalPairingAuthorityStore, PlatformSqlClient } from './postgres-pairing-store.ts'

/**
 * Compose existing data owners without exposing cleanup authority to HTTP callers.
 * @param owners - Account metadata, membership, pairing and attachment owners of this Platform.
 * @returns Account-scoped planning, revocation and recoverable erasure.
 */
export function createAccountDeletionOwner(owners: {
  account: AccountService
  membership: ProjectMembershipService
  authority: PostgresPersonalPairingAuthorityStore
  pairing: PersonalPairingComposition['accountDeletion']
  attachments: { revokeAccount(accountId: PlatformAccountId, pairingIds: readonly PersonalPairingId[]): Promise<void> }
}): AccountDeletionOwner {
  const plan: AccountDeletionOwner['plan'] = async (accountId) => {
    const projects = await owners.membership.accountDeletionProjects(accountId)
    const identities = await owners.account.publicIdentitiesByIds(
      projects.flatMap(project => project.candidates.map(candidate => candidate.accountId)),
    )
    return projects.map(project => ({ ...project, candidates: project.candidates.map(candidate => ({
      ...candidate, label: identities.get(candidate.accountId)?.githubLogin ?? candidate.label,
    })) }))
  }
  return {
    plan,
    async revoke(accountId) {
      const snapshot = await owners.authority.captureAccountDeletion(accountId)
      await owners.pairing.revoke(accountId, snapshot.desktopInstallationIds)
    },
    async cleanup(accountId, successors) {
      const unresolved = await owners.membership.deleteAccountMemberships(accountId, successors)
      if (unresolved.length > 0) return await plan(accountId)
      const snapshot = await owners.authority.captureAccountDeletion(accountId)
      await owners.attachments.revokeAccount(accountId, snapshot.pairingIds)
      await owners.pairing.cleanup(accountId, snapshot.desktopInstallationIds)
      await owners.authority.completeAccountDeletion(accountId)
      return []
    },
  }
}

/**
 * Hold current pairing authority until a publication reservation commits.
 * @param client - The attachment owner's active PostgreSQL transaction.
 * @param databaseIdentity - Selected deployment namespace.
 * @param pairingId - Pairing admitting this publication.
 * @returns The owning account; missing or revoked pairing authority rejects the publication.
 */
export async function authorizeAttachmentPairing(
  client: PlatformSqlClient,
  databaseIdentity: string,
  pairingId: PersonalPairingId,
): Promise<PlatformAccountId> {
  const result = await client.query(
    'SELECT pairing_id, account_id FROM remote_access_mobile_pairings WHERE database_identity = $1 AND pairing_id = $2 FOR SHARE',
    [databaseIdentity, pairingId],
  )
  if (result.rows.length !== 1) throw new RemoteAttachmentError('ATTACHMENT_PAIRING_MISMATCH', 'Account attachment pairing is revoked')
  return parsePlatformAccountId(result.rows[0]?.account_id)
}
