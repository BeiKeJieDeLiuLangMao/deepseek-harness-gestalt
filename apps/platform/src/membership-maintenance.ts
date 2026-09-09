/** Read-only evidence for the first operated membership authority cutover. */
import { createHash } from 'node:crypto'
import type { Pool } from 'pg'

/**
 * Verify the selected namespace and empty attachment authority without creating tables.
 * @param pool - Production PostgreSQL pool with a bounded statement timeout.
 * @param databaseIdentity - Attachment authority selected by the runtime configuration.
 * @param namespace - Membership namespace selected by the runtime configuration.
 * @param expectedDigest - Approved complete source digest, or undefined before import.
 * @returns The imported source digest, or null for an uninitialized target.
 */
export async function inspectMembershipMaintenanceTarget(
  pool: Pool,
  databaseIdentity: string,
  namespace: string,
  expectedDigest: string | undefined,
): Promise<string | null> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN READ ONLY')
    const phase = await client.query<{ phase: string }>(
      'SELECT phase FROM remote_attachment_storage_phase WHERE database_identity = $1', [databaseIdentity],
    )
    if (phase.rows.length !== 1 || phase.rows[0]?.phase !== 'oss') throw new Error('Membership cutover requires OSS attachment authority')
    for (const table of [
      'remote_attachment_objects', 'remote_attachment_publish_intents',
      'remote_attachment_pairing_owners', 'remote_attachment_account_cleanup',
    ]) {
      const exists = await client.query<{ name: string | null }>('SELECT to_regclass($1) AS name', [table])
      if (exists.rows[0]?.name === null) {
        if (table === 'remote_attachment_objects' || table === 'remote_attachment_publish_intents') {
          throw new Error('Membership cutover requires initialized attachment metadata tables')
        }
        continue
      }
      const records = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM ${table} WHERE database_identity = $1`, [databaseIdentity],
      )
      if (records.rows[0]?.count !== 0) throw new Error('Attachment metadata changed; review ownership before membership cutover')
    }
    const tables = await client.query<{ documents: string | null; imports: string | null }>(
      "SELECT to_regclass('project_membership_documents') AS documents, to_regclass('project_membership_imports') AS imports",
    )
    const present = tables.rows[0]
    if (present === undefined) throw new Error('Membership table inventory is unavailable')
    const documents = present.documents === null ? [] : (await client.query<{ document: string }>(
      'SELECT document FROM project_membership_documents WHERE namespace = $1', [namespace],
    )).rows
    const imports = present.imports === null ? [] : (await client.query<{ source_digest: string }>(
      'SELECT source_digest FROM project_membership_imports WHERE namespace = $1', [namespace],
    )).rows
    if (expectedDigest === undefined) {
      if (documents.length !== 0 || imports.length !== 0) throw new Error('Membership target is already initialized')
      return null
    }
    if (documents.length !== 1 || imports.length !== 1
      || imports[0]?.source_digest !== expectedDigest
      || createHash('sha256').update(documents[0]?.document ?? '').digest('hex') !== expectedDigest) {
      throw new Error('Imported membership source marker or current document differs from the approved source')
    }
    return expectedDigest
  } finally {
    try { await client.query('ROLLBACK') } finally { client.release() }
  }
}
