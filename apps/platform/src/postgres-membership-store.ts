/** One PostgreSQL authority for the existing Project Membership document. */
import { parsePlatformAccountId, type PlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import type { PlatformAccountWriteFence } from './account-write-fence.ts'
import { createHash } from 'node:crypto'
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg'
import {
  validateProjectMembershipDocument,
  type ProjectMembershipPersistence,
  type ProjectMembershipTransaction,
} from '@deepseek-ai/dsh-project-membership-core'

const SCHEMA = [`
CREATE TABLE IF NOT EXISTS project_membership_documents (
  namespace text PRIMARY KEY,
  document text NOT NULL
)`, `CREATE TABLE IF NOT EXISTS project_membership_imports (
  namespace text PRIMARY KEY,
  source_digest text NOT NULL
)`]

/** Environment-scoped membership transactions shared by every Platform Instance. */
export class PostgresProjectMembershipPersistence implements ProjectMembershipPersistence {
  /**
   * @param pool - Existing shared PostgreSQL connection pool.
   * @param namespace - Selected deployment identity namespace.
   * @param accountWriteFence - Optional Account reference checks for ordinary writes.
   * @param deadline - Absolute maintenance deadline; each SQL operation uses its remaining time.
   */
  constructor(
    private readonly pool: Pool,
    private readonly namespace: string,
    private readonly accountWriteFence?: PlatformAccountWriteFence,
    private readonly deadline?: number,
  ) {
    if (namespace.trim() === '') throw new TypeError('Membership namespace is required')
  }

  /** Create tables without importing, replacing or initializing membership content. */
  async migrate(): Promise<void> {
    if (this.deadline === undefined) {
      await this.pool.query(SCHEMA.join(';\n'))
      return
    }
    await this.locked(async (client) => {
      for (const sql of SCHEMA) await this.query(client, sql)
    })
  }

  async transact<T>(operation: (transaction: ProjectMembershipTransaction) => Promise<T>): Promise<T> {
    return await this.locked(async (client) => {
      const result = await this.query<{ document: string }>(client, 'SELECT document FROM project_membership_documents WHERE namespace = $1', [this.namespace])
      const document = result.rows[0]?.document
      if (document === undefined) throw new Error('PostgreSQL membership authority is not initialized; import an approved snapshot before serving requests')
      let staged: string | undefined
      const value = await operation({ document, write(next) { staged = next } })
      if (staged !== undefined) {
        if (this.accountWriteFence !== undefined) {
          const before = membershipWriteReferences(document)
          const accounts = new Set<PlatformAccountId>()
          for (const [key, accountId] of membershipWriteReferences(staged)) if (!before.has(key)) accounts.add(accountId)
          for (const accountId of [...accounts].sort()) await this.accountWriteFence(client, accountId)
        }
        await this.query(client, 'UPDATE project_membership_documents SET document = $2 WHERE namespace = $1', [this.namespace, staged])
      }
      return value
    })
  }

  /**
   * Import one reviewed, immutable snapshot into an uninitialized authority.
   * @param document - Exact bytes from the approved snapshot.
   * @param expectedDigest - SHA-256 recorded during the deployment preflight.
   * @returns True only for the first import; the same recorded digest is a no-op after subsequent edits.
   */
  async importSnapshot(document: string, expectedDigest: string): Promise<boolean> {
    const digest = createHash('sha256').update(document).digest('hex')
    if (digest !== expectedDigest) throw new Error('Membership snapshot digest does not match the approved source')
    validateProjectMembershipDocument(document)
    return await this.locked(async (client) => {
      const marker = await this.query<{ source_digest: string }>(client, 'SELECT source_digest FROM project_membership_imports WHERE namespace = $1', [this.namespace])
      if (marker.rows[0] !== undefined) {
        if (marker.rows[0].source_digest !== digest) throw new Error('Membership authority was imported from another source')
        const retained = await this.query(client, 'SELECT namespace FROM project_membership_documents WHERE namespace = $1', [this.namespace])
        if (retained.rows.length !== 1) throw new Error('Membership import marker has no authoritative document')
        return false
      }
      const existing = await this.query(client, 'SELECT namespace FROM project_membership_documents WHERE namespace = $1', [this.namespace])
      if (existing.rows.length !== 0) throw new Error('Membership authority is not empty')
      await this.query(client, 'INSERT INTO project_membership_documents (namespace, document) VALUES ($1,$2)', [this.namespace, document])
      await this.query(client, 'INSERT INTO project_membership_imports (namespace, source_digest) VALUES ($1,$2)', [this.namespace, digest])
      return true
    })
  }

  /**
   * Export the current authority under its transaction lock.
   * @returns Document and digest; deployment must fence all writers before using this as a rollback source.
   */
  async exportSnapshot(): Promise<{ document: string; digest: string }> {
    return await this.transact((transaction) => {
      if (transaction.document === undefined) throw new Error('Membership authority is not initialized')
      return Promise.resolve({
        document: transaction.document,
        digest: createHash('sha256').update(transaction.document).digest('hex'),
      })
    })
  }

  private async query<T extends QueryResultRow = QueryResultRow>(
    client: PoolClient, sql: string, values?: unknown[],
  ): Promise<QueryResult<T>> {
    if (this.deadline !== undefined) {
      const remaining = this.deadline - Date.now()
      if (remaining <= 0) throw new Error('Membership maintenance SQL deadline expired')
      await client.query("SELECT set_config('statement_timeout', $1, true), set_config('lock_timeout', $1, true)", [String(remaining)])
    }
    return await client.query<T>(sql, values)
  }

  private async locked<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await this.query(client, 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`project-membership:${this.namespace}`])
      const result = await operation(client)
      await this.query(client, 'COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }
}


function membershipWriteReferences(document: string): Map<string, PlatformAccountId> {
  validateProjectMembershipDocument(document)
  const state = JSON.parse(document) as { memberships: Array<{ id: string; accountId: string }>
    invitations: Array<{ id: string; inviterAccountId: string; inviteeAccountId: string }> }
  const references = new Map<string, PlatformAccountId>()
  for (const member of state.memberships) references.set(`membership:${member.id}`, parsePlatformAccountId(member.accountId))
  for (const invite of state.invitations) {
    references.set(`inviter:${invite.id}`, parsePlatformAccountId(invite.inviterAccountId))
    references.set(`invitee:${invite.id}`, parsePlatformAccountId(invite.inviteeAccountId))
  }
  return references
}
