/** Account-row admission for writes owned by independent PostgreSQL product transactions. */
import { AccountError, type PlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import type { PlatformSqlClient } from './postgres-pairing-store.ts'

/** Account admission invoked inside an owner's active transaction before publishing new personal records. */
export type PlatformAccountWriteFence = (client: PlatformSqlClient, accountId: PlatformAccountId) => Promise<void>

/**
 * Require a live account while retaining its shared row lock until the owner commits.
 * Owners acquire their document lock first. Account deletion holds only account/session rows during
 * acceptance and releases them before entering any owner, so it never reverses that lock order.
 * @param identityNamespace - Deployment owning the referenced account.
 * @returns Transaction-bound admission that rejects a deleted or deleting account.
 */
export function platformAccountWriteFence(identityNamespace: string): PlatformAccountWriteFence {
  return async (client, accountId) => {
    const account = await client.query('SELECT id FROM account_accounts WHERE id = $1 AND identity_namespace = $2 FOR SHARE', [accountId, identityNamespace])
    if (account.rows.length !== 1) throw new AccountError('SESSION_REVOKED', 'Referenced Account is unavailable')
    const deletion = await client.query('SELECT id FROM account_deletions WHERE account_id = $1 AND completed_at IS NULL', [accountId])
    if (deletion.rows.length > 0) throw new AccountError('ACCOUNT_DELETING', 'Referenced Account is deleting')
  }
}
