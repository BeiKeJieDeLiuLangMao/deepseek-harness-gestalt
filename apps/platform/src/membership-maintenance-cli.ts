/** Read-only PostgreSQL and OSS checks; this entry never starts Platform or migrates schema. */
import pg from 'pg'
import { loadOperatedPlatformConfig } from './production-env.ts'
import { inspectMembershipMaintenanceTarget } from './membership-maintenance.ts'
import { verifyEmptyEcsRamRoleOssPrefix } from './oss-client.ts'

const [mode, digest, ...extra] = process.argv.slice(2)
if ((mode !== 'empty' && mode !== 'imported') || extra.length !== 0
  || (mode === 'empty' ? digest !== undefined : digest === undefined || !/^[a-f0-9]{64}$/u.test(digest))) {
  throw new Error('Membership maintenance requires empty or imported with a full approved SHA-256')
}
const remainingMs = Number(process.env.DSH_MEMBERSHIP_DEADLINE) * 1000 - Date.now()
if (!Number.isSafeInteger(remainingMs) || remainingMs <= 0) throw new Error('Membership maintenance deadline expired')
const config = loadOperatedPlatformConfig()
if (config.membershipBackend !== 'postgres' || config.remoteAttachments.storage !== 'oss') {
  throw new Error('Membership maintenance requires PostgreSQL membership and OSS attachments')
}
const pool = new pg.Pool({ ...config.postgres, connectionTimeoutMillis: remainingMs, statement_timeout: remainingMs })
try {
  const sourceDigest = await inspectMembershipMaintenanceTarget(
    pool, config.environment.databaseIdentity, config.environment.identityNamespace, digest,
  )
  await verifyEmptyEcsRamRoleOssPrefix(config.oss)
  process.stdout.write(`${JSON.stringify({ sourceDigest })}\n`)
} finally { await pool.end() }
