/** Explicit, writer-fenced Project Membership snapshot import and rollback export. */
import pg from 'pg'
import { parseMembershipCutoverCommand, readMembershipCutoverSnapshot, writeMembershipCutoverSnapshot } from './membership-cutover.ts'
import { PostgresProjectMembershipPersistence } from './postgres-membership-store.ts'
import { loadOperatedPlatformConfig } from './production-env.ts'

const command = parseMembershipCutoverCommand(process.argv.slice(2))
if (command.kind === 'capture') {
  const snapshot = await readMembershipCutoverSnapshot(command.source)
  await writeMembershipCutoverSnapshot(command.output, snapshot)
  process.stdout.write(`${snapshot.digest}\n`)
} else {
  const config = loadOperatedPlatformConfig()
  const pool = new pg.Pool(config.postgres)
  try {
    const store = new PostgresProjectMembershipPersistence(pool, config.environment.identityNamespace)
    await store.migrate()
    if (command.kind === 'import') {
      const snapshot = await readMembershipCutoverSnapshot(command.source)
      const imported = await store.importSnapshot(snapshot.document, command.digest)
      process.stdout.write(`${imported ? 'imported' : 'already-imported'} ${snapshot.digest}\n`)
    } else {
      const pending = await pool.query('SELECT id FROM account_deletions WHERE identity_namespace = $1 AND completed_at IS NULL LIMIT 1', [config.environment.identityNamespace])
      if (pending.rows.length > 0) throw new Error('Membership rollback is blocked by unfinished account deletion')
      const snapshot = await store.exportSnapshot()
      await writeMembershipCutoverSnapshot(command.output, snapshot)
      process.stdout.write(`${snapshot.digest}\n`)
    }
  } finally {
    await pool.end()
  }
}
