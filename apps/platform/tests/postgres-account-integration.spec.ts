import { Context } from '@deepseek-ai/cordis'
import { ProjectMembership } from '@deepseek-ai/dsh-project-membership-core'
import { PostgresProjectMembershipPersistence } from '../src/postgres-membership-store.ts'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseInstallationId,
  parseAccountDeletionId,
  parseLoginAttemptId,
  parsePlatformAccountId,
} from '@deepseek-ai/dsh-platform-account'
import {
  parseAttachmentBlobReservationId,
  parseDevicePrincipalId,
  parsePairingChallengeId,
  parsePairingCompletionId,
  parsePendingPairingId,
  parsePersonalPairingId,
  parsePersonalPairingKeyReference,
  parseRelayConnectionToken,
  parseRelayCredentialFingerprint,
} from '@deepseek-ai/dsh-remote-access'
import pg from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { OssRemoteAttachmentStore } from '../src/oss-attachment-store.ts'
import { PostgresRemoteAttachmentStore } from '../src/postgres-attachment-store.ts'
import { platformAccountWriteFence } from '../src/account-write-fence.ts'
import { parseRelayRouteId } from '@deepseek-ai/dsh-remote-protocol'
import type { CreatedSession } from '@deepseek-ai/dsh-platform-account-core'
import { authorizeAttachmentPairing } from '../src/account-deletion-owner.ts'
import {
  emptyPairingTransactionState,
  encodePairingTransactionState,
} from '../src/pairing-state-codec.ts'
import { PostgresAccountBackend } from '../src/postgres-backend.ts'
import { PostgresPersonalPairingAuthorityStore } from '../src/postgres-pairing-store.ts'

const postgresAvailable = spawnSync('initdb', ['--version'], { encoding: 'utf8' }).status === 0
  && spawnSync('postgres', ['--version'], { encoding: 'utf8' }).status === 0

describe.skipIf(!postgresAvailable)('PostgresAccountBackend with disposable PostgreSQL', () => {
  it.each([
    ['pairing', 'delete-first'], ['pairing', 'write-first'],
    ['membership', 'delete-first'], ['membership', 'write-first'],
  ] as const)('fences %s writes when account deletion commits %s', async (lane, order) => {
    const runtime = await startPostgres()
    const context = new Context()
    const backend = new PostgresAccountBackend('write-fence', runtime.pool)
    let releaseWrite = (): void => {}
    try {
      await backend.migrate()
      const alice = await seedAccount(backend, 501)
      const bob = await seedAccount(backend, 502)
      let acquired = (): void => {}
      const acquiredFence = new Promise<void>((resolve) => { acquired = resolve })
      const heldWrite = new Promise<void>((resolve) => { releaseWrite = resolve })
      let hold = order === 'write-first'
      const realFence = platformAccountWriteFence('gestalt-production')
      const fence: typeof realFence = async (client, accountId) => {
        await realFence(client, accountId)
        if (hold && accountId === alice.account.id) { acquired(); await heldWrite }
      }
      const authority = new PostgresPersonalPairingAuthorityStore('write-fence', runtime.pool, fence)
      await authority.migrate()
      const persistence = new PostgresProjectMembershipPersistence(runtime.pool, 'gestalt-production', fence)
      await persistence.migrate()
      const empty = JSON.stringify({ formatVersion: 1, projects: [], memberships: [], invitations: [] })
      await persistence.importSnapshot(empty, createHash('sha256').update(empty).digest('hex'))
      const membership = new ProjectMembership(context, persistence)
      const project = await membership.createProject(bob.account.id, { name: 'Keep project', remoteUrl: 'https://github.com/example/keep.git' })
      const desktopId = parseInstallationId('late-desktop')
      const routeId = parseRelayRouteId('late-route')
      const write = () => lane === 'pairing'
        ? authority.enableDesktop(alice.account.id, desktopId, routeId)
        : membership.invite(bob.account.id, { projectId: project.id, inviteeAccountId: alice.account.id, grantedRole: 'member' })
      const acceptDeletion = () => backend.beginAccountDeletion({ operationId: parseAccountDeletionId('write-fence-deletion'),
        accountId: alice.account.id, identityNamespace: 'gestalt-production', installationId: alice.session.installationId,
        publicKey: alice.session.publicKey, recoveryTokenHash: 'a'.repeat(43), successors: [], sessionIds: [], status: 'deleting', projects: [] }, alice.session)
      if (order === 'write-first') {
        const pendingWrite = write()
        await acquiredFence
        const deleting = acceptDeletion()
        await vi.waitFor(async () => {
          const blocked = await runtime.pool.query("SELECT pid FROM pg_stat_activity WHERE query = 'SELECT id FROM account_accounts WHERE id = $1 FOR UPDATE' AND wait_event_type = 'Lock'")
          expect(blocked.rowCount).toBe(1)
        })
        hold = false
        releaseWrite()
        await pendingWrite
        await deleting
        if (lane === 'pairing') expect((await authority.captureAccountDeletion(alice.account.id)).desktopInstallationIds).toContain(desktopId)
        else expect(await membership.pendingInvitationsFor(alice.account.id)).toHaveLength(1)
      } else {
        await acceptDeletion()
      }
      await expect(write()).rejects.toMatchObject(order === 'write-first' && lane === 'membership'
        ? { code: 'DUPLICATE_INVITEE' } : { code: 'ACCOUNT_DELETING' })
      await membership.deleteAccountMemberships(alice.account.id, [])
      await expect(membership.invite(bob.account.id, { projectId: project.id, inviteeAccountId: alice.account.id, grantedRole: 'member' })).rejects.toMatchObject({ code: 'ACCOUNT_DELETING' })
      expect(await membership.pendingInvitationsFor(alice.account.id)).toEqual([])
      const reopened = new PostgresPersonalPairingAuthorityStore('write-fence', runtime.pool, realFence)
      await expect(reopened.enableDesktop(alice.account.id, parseInstallationId('after-restart'), parseRelayRouteId('restarted-route'))).rejects.toMatchObject({ code: 'ACCOUNT_DELETING' })
      expect((await membership.roster(bob.account.id, project.id)).members).toHaveLength(1)
    } finally {
      releaseWrite()
      await context.fiber.dispose()
      await runtime.close()
    }
  }, 20_000)

  it('retains failed PostgreSQL account attachment quota cleanup across store reconstruction', async () => {
    const runtime = await startPostgres()
    const context = new Context()
    const nextContext = new Context()
    let quotaAvailable = true
    const release = vi.fn(async () => { if (!quotaAvailable) throw new Error('quota unavailable') })
    const namespace = 'deletion-postgres-attachments'
    const options = { maxBlobBytes: 4, capabilityLifetimeMs: 1000, maxRetainedBlobs: 4, quotaCleanup: { release } }
    try {
      const first = new PostgresRemoteAttachmentStore(context, namespace, runtime.pool, options)
      await first.migrate()
      const deleted = parsePersonalPairingId('deleted-pairing')
      const retained = parsePersonalPairingId('retained-pairing')
      await first.publish({ pairingId: deleted, ciphertext: Uint8Array.of(1), now: 1,
        quota: { id: parseAttachmentBlobReservationId('deleted-quota'), expiresAt: 2000, release } })
      const keep = await first.publish({ pairingId: retained, ciphertext: Uint8Array.of(2), now: 1 })
      quotaAvailable = false
      await expect(first.revokePairings([deleted])).rejects.toThrow('quota unavailable')
      expect((await runtime.pool.query('SELECT * FROM remote_attachment_blobs WHERE pairing_id = $1', [deleted])).rowCount).toBe(0)
      expect((await runtime.pool.query('SELECT * FROM remote_attachment_quota_releases')).rowCount).toBe(1)
      const second = new PostgresRemoteAttachmentStore(nextContext, namespace, runtime.pool, options)
      quotaAvailable = true
      await second.migrate()
      await second.revokePairings([deleted])
      expect((await runtime.pool.query('SELECT * FROM remote_attachment_quota_releases')).rowCount).toBe(0)
      expect((await second.inspect({ pairingId: retained, capability: keep.capability, now: 2 })).byteLength).toBe(1)
    } finally {
      await context.fiber.dispose()
      await nextContext.fiber.dispose()
      await runtime.close()
    }
  }, 20_000)

  it('retains consumed OSS object ownership after deletion failure and waits for live publication before account cleanup', async () => {
    const runtime = await startPostgres()
    const context = new Context()
    const nextContext = new Context()
    const namespace = 'deletion-oss-attachments'
    const objects = new Map<string, Uint8Array>()
    let deleteAvailable = false
    let holdUpload: Promise<void> | undefined
    let beganUpload: (() => void) | undefined
    const objectClient = {
      putObject: async (key: string, value: Uint8Array) => { beganUpload?.(); await holdUpload; objects.set(key, value.slice()) },
      getObject: async (key: string) => objects.get(key)!.slice(),
      deleteObject: async (key: string) => { if (!deleteAvailable) throw new Error('OSS deletion unavailable'); objects.delete(key) },
    }
    const options = { maxBlobBytes: 4, capabilityLifetimeMs: 1000, maxRetainedBlobs: 4,
      objectPrefix: `remote-attachments/${namespace}`, sweepIntervalMs: 60_000, cleanupConcurrency: 1,
      capacityRetryAfterSeconds: 1, quotaCleanup: { release: async () => {} }, inactivePairingIds: async () => [],
      clock: { now: () => 1 }, schedule: () => ({ unref() {}, cancel() {} }),
      authorizePairing: async (_client: unknown, pairingId: string) => parsePlatformAccountId(pairingId === 'deleted-oss-pairing' ? 'deleted-oss-account' : 'retained-oss-account') }
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const legacy = new PostgresRemoteAttachmentStore(new Context(), namespace, runtime.pool, options)
      await legacy.migrate()
      await new PostgresPersonalPairingAuthorityStore(namespace, runtime.pool).migrate()
      await runtime.pool.query("UPDATE remote_attachment_storage_phase SET phase = 'bridge' WHERE database_identity = $1", [namespace])
      const first = new OssRemoteAttachmentStore(context, namespace, runtime.pool, objectClient, options)
      await first.migrate()
      const deleted = parsePersonalPairingId('deleted-oss-pairing')
      const retained = parsePersonalPairingId('retained-oss-pairing')
      const grant = await first.publish({ pairingId: deleted, ciphertext: Uint8Array.of(1), now: 1 })
      const keep = await first.publish({ pairingId: retained, ciphertext: Uint8Array.of(2), now: 1 })
      const delivery = await first.consume({ pairingId: deleted, capability: grant.capability, now: 2 })
      await delivery.complete()
      expect((await runtime.pool.query('SELECT * FROM remote_attachment_objects WHERE pairing_id = $1', [deleted])).rowCount).toBe(0)
      expect((await runtime.pool.query('SELECT * FROM remote_attachment_account_cleanup WHERE pairing_id = $1', [deleted])).rowCount).toBe(1)
      await expect(first.revokeAccount(parsePlatformAccountId('deleted-oss-account'), [])).rejects.toThrow('OSS deletion unavailable')
      const second = new OssRemoteAttachmentStore(nextContext, namespace, runtime.pool, objectClient, options)
      await second.migrate()
      await expect(second.revokeAccount(parsePlatformAccountId('deleted-oss-account'), [])).rejects.toThrow('OSS deletion unavailable')
      deleteAvailable = true
      await second.revokeAccount(parsePlatformAccountId('deleted-oss-account'), [])
      expect((await runtime.pool.query('SELECT * FROM remote_attachment_account_cleanup WHERE pairing_id = $1', [deleted])).rowCount).toBe(0)
      expect(objects.size).toBe(1)
      expect((await second.inspect({ pairingId: retained, capability: keep.capability, now: 2 })).byteLength).toBe(1)
      let releaseUpload = (): void => {}
      holdUpload = new Promise<void>((resolve) => { releaseUpload = resolve })
      const started = new Promise<void>((resolve) => { beganUpload = resolve })
      const publishing = first.publish({ pairingId: deleted, ciphertext: Uint8Array.of(3), now: 1 })
      await started
      await expect(second.revokePairings([deleted])).rejects.toThrow('publication is still settling')
      releaseUpload()
      await publishing
      await second.revokePairings([deleted])
      expect(objects.size).toBe(1)
      await expect(authorizeAttachmentPairing(runtime.pool, namespace, deleted)).rejects.toMatchObject({ code: 'ATTACHMENT_PAIRING_MISMATCH' })
    } finally {
      reported.mockRestore()
      await context.fiber.dispose()
      await nextContext.fiber.dispose()
      await runtime.close()
    }
  }, 20_000)

  it('serializes shared membership updates and never reimports over later changes', async () => {
    const runtime = await startPostgres()
    const firstContext = new Context()
    const secondContext = new Context()
    try {
      const firstStore = new PostgresProjectMembershipPersistence(runtime.pool, 'deletion-membership')
      const secondStore = new PostgresProjectMembershipPersistence(runtime.pool, 'deletion-membership')
      await firstStore.migrate()
      const empty = JSON.stringify({ formatVersion: 1, projects: [], memberships: [], invitations: [] })
      const digest = createHash('sha256').update(empty).digest('hex')
      expect((await Promise.all([
        firstStore.importSnapshot(empty, digest), secondStore.importSnapshot(empty, digest),
      ])).sort()).toEqual([false, true])
      const first = new ProjectMembership(firstContext, firstStore)
      const second = new ProjectMembership(secondContext, secondStore)
      const alice = parsePlatformAccountId('owner-alice')
      const bob = parsePlatformAccountId('member-bob')
      const project = await first.createProject(alice, { name: 'Shared deletion', remoteUrl: 'https://github.com/example/deletion.git' })
      await second.invite(alice, { projectId: project.id, inviteeAccountId: bob, grantedRole: 'member' })
      const invitations = await first.pendingInvitationsFor(bob)
      const invitation = invitations[0]
      if (invitation === undefined) throw new Error('expected invitation')
      const member = await second.acceptInvitation(bob, { invitationId: invitation.id, link: { workspaceName: 'Keep this workspace' } })
      await first.deleteAccountMemberships(alice, [{ projectId: project.id, successorMembershipId: member.id }])
      expect(await secondStore.importSnapshot(empty, digest)).toBe(false)
      await expect(second.roster(bob, project.id)).resolves.toMatchObject({ members: [{ accountId: bob, role: 'owner' }] })
      await expect(first.roster(alice, project.id)).rejects.toMatchObject({ code: 'NOT_A_MEMBER' })
      const exported = await firstStore.exportSnapshot()
      expect(exported.document).not.toBe(empty)
      await expect(secondStore.importSnapshot(exported.document, exported.digest)).rejects.toThrow('another source')
    } finally {
      await firstContext.fiber.dispose()
      await secondContext.fiber.dispose()
      await runtime.close()
    }
  })

  it('retains accepted account deletion across backend reconstruction and revokes every installation', async () => {
    const runtime = await startPostgres()
    try {
      const backend = new PostgresAccountBackend('gestalt', runtime.pool)
      await backend.migrate()
      const publicKey = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' })
      const sessions = []
      for (const suffix of ['desktop', 'mobile']) {
        const id = parseLoginAttemptId(`delete-attempt-${suffix}`)
        await backend.createAttempt({ id, environment: 'production', identityNamespace: 'gestalt-production',
          installationId: parseInstallationId(`delete-${suffix}`), installationKind: 'desktop',
          presentation: { name: suffix, platform: 'linux' }, publicKey,
          state: `delete-state-${suffix}`, codeVerifier: 'verifier', expiresAt: Date.now() + 60_000,
          status: 'pending',
        })
        await backend.authorizeAttempt(id, { providerSubject: 77, login: 'deleting', avatarUrl: 'https://avatars.example/deleting' })
        sessions.push(await backend.consumeAuthorizedAttempt(id, `refresh-${suffix}`, Date.now() + 60_000))
      }
      const first = sessions[0]
      if (first === undefined) throw new Error('expected first installation')
      const operationId = parseAccountDeletionId('durable-deletion')
      await backend.beginAccountDeletion({
        operationId, accountId: first.account.id, identityNamespace: 'gestalt-production',
        installationId: first.session.installationId, publicKey,
        recoveryTokenHash: 'a'.repeat(43), successors: [], sessionIds: [], status: 'deleting', projects: [],
      }, first.session)
      const reopened = new PostgresAccountBackend('gestalt', runtime.pool)
      await expect(reopened.getAccountDeletion(operationId)).resolves.toMatchObject({ status: 'deleting', accountId: first.account.id })
      for (const entry of sessions) await expect(reopened.getSession(entry.session.id)).resolves.toMatchObject({ active: false })
      await reopened.withAccountDeletionLock(operationId, async () => {
        await expect(backend.withAccountDeletionLock(operationId, async () => { throw new Error('concurrent cleanup entered') })).resolves.toBe(false)
        await reopened.completeAccountDeletion(operationId, Date.now())
      })
      await expect(backend.getAccount(first.account.id)).resolves.toBeUndefined()
      await expect(backend.getAccountDeletion(operationId)).resolves.toMatchObject({ status: 'complete', sessionIds: [] })
    } finally { await runtime.close() }
  })

  it('replaces a pre-presentation Mobile session during forced re-login', async () => {
    const runtime = await startPostgres()
    try {
      await runtime.pool.query(LEGACY_SCHEMA)
      await runtime.pool.query(
        `INSERT INTO account_accounts (id, identity_namespace, github_id, github_login, avatar_url)
         VALUES ('account-legacy', 'gestalt-production', 7, 'octocat', 'https://avatars.example/octocat')`,
      )
      await runtime.pool.query(
        `INSERT INTO account_sessions (
           id, identity_namespace, account_id, installation_id, installation_kind,
           public_key, revision, active, refresh_hash, refresh_expires_at
         ) VALUES (
           'session-legacy', 'gestalt-production', 'account-legacy', 'mobile-stable', 'mobile',
           '{}'::jsonb, 1, TRUE, 'legacy-refresh', 9999999999999
         )`,
      )
      const backend = new PostgresAccountBackend('gestalt', runtime.pool)
      await backend.migrate()
      await expect(backend.getSession('session-legacy' as never)).resolves.toMatchObject({
        installationKind: 'mobile',
        installationId: 'mobile-stable',
        active: true,
      })
      const attemptId = parseLoginAttemptId('attempt-relogin')
      await backend.createAttempt({
        id: attemptId,
        environment: 'production',
        identityNamespace: 'gestalt-production',
        installationId: parseInstallationId('mobile-stable'),
        installationKind: 'mobile',
        presentation: { name: 'Real replacement phone', platform: 'android' },
        publicKey: {},
        state: 'state-relogin',
        codeVerifier: 'verifier-relogin',
        expiresAt: Date.now() + 60_000,
        status: 'pending',
      })
      await backend.authorizeAttempt(attemptId, {
        providerSubject: 7,
        login: 'octocat',
        avatarUrl: 'https://avatars.example/octocat',
      })

      await expect(backend.hasActiveSessionByInstallation(
        'gestalt-production',
        parseInstallationId('mobile-stable'),
      )).resolves.toBe(true)
      const replacement = await backend.consumeAuthorizedAttempt(attemptId, 'replacement-refresh', Date.now() + 60_000)

      expect(replacement.replacedSessionId).toBe('session-legacy')
      expect(replacement.session).toMatchObject({
        installationId: 'mobile-stable',
        installationKind: 'mobile',
        presentation: { name: 'Real replacement phone', platform: 'android' },
        active: true,
      })
      const legacy = await runtime.pool.query<{ active: boolean }>(
        'SELECT active FROM account_sessions WHERE id = $1',
        ['session-legacy'],
      )
      expect(legacy.rows).toEqual([{ active: false }])
    } finally {
      await runtime.close()
    }
  })

  it('preserves overlapping Relay presence leases and expires a crashed connection', async () => {
    const runtime = await startPostgres()
    try {
      const writer = new PostgresPersonalPairingAuthorityStore('gestalt-production', runtime.pool)
      const reader = new PostgresPersonalPairingAuthorityStore('gestalt-production', runtime.pool)
      await writer.migrate()
      const accountId = parsePlatformAccountId('account-presence')
      const pendingPairingId = parsePendingPairingId('pending-presence')
      const pairingId = parsePersonalPairingId('pairing-presence')
      const credentialFingerprint = parseRelayCredentialFingerprint('credential-presence')
      await writer.confirmMobilePairing({
        accountId,
        desktopInstallationId: parseInstallationId('desktop-presence'),
        mobileInstallationId: parseInstallationId('mobile-presence'),
        pendingPairingId,
        pairingId,
        credentialFingerprint,
        lastAccessAt: 100,
        sealedRelayAuthority: Uint8Array.of(1, 2, 3),
      })
      await writer.recordRelayLease({
        credentialFingerprint,
        connectionToken: parseRelayConnectionToken('connection-a'),
        expiresAt: 500,
        accessedAt: 200,
      })
      await reader.recordRelayLease({
        credentialFingerprint,
        connectionToken: parseRelayConnectionToken('connection-a'),
        expiresAt: 450,
        accessedAt: 180,
      })
      await expect(writer.getPersonalPairingActivity(pairingId, 475)).resolves.toEqual({
        lastAccessAt: 200,
        online: true,
      })
      await reader.recordRelayLease({
        credentialFingerprint,
        connectionToken: parseRelayConnectionToken('connection-b'),
        expiresAt: 600,
        accessedAt: 250,
      })
      await writer.releaseRelayLease({
        credentialFingerprint,
        connectionToken: parseRelayConnectionToken('connection-a'),
        observedAt: 300,
      })
      await expect(reader.getPersonalPairingActivity(pairingId, 300)).resolves.toEqual({
        lastAccessAt: 250,
        online: true,
      })
      await expect(reader.getPersonalPairingActivity(pairingId, 600)).resolves.toEqual({
        lastAccessAt: 250,
        online: false,
      })
      const durable = await runtime.pool.query<{ presence_leases: unknown }>(
        `SELECT presence_leases
           FROM remote_access_mobile_pairings
          WHERE database_identity = $1 AND pending_pairing_id = $2`,
        ['gestalt-production', pendingPairingId],
      )
      expect(durable.rows).toEqual([{ presence_leases: {} }])
    } finally {
      await runtime.close()
    }
  })

  it('cannot leave a new login session active after concurrent account deletion acceptance', async () => {
    const runtime = await startPostgres()
    const backend = new PostgresAccountBackend('login-deletion-race', runtime.pool)
    let releaseLogin = (): void => {}
    let login: Promise<CreatedSession> | undefined
    let deletion: Promise<unknown> | undefined
    try {
      await backend.migrate()
      const account = await seedAccount(backend, 901)
      const id = parseLoginAttemptId('concurrent-login')
      await backend.createAttempt({ id, environment: 'production', identityNamespace: 'gestalt-production',
        installationId: parseInstallationId('concurrent-installation'), installationKind: 'desktop',
        presentation: { name: 'Concurrent desktop', platform: 'linux' }, publicKey: account.session.publicKey,
        state: 'concurrent-state', codeVerifier: 'verifier', expiresAt: Date.now() + 60_000, status: 'pending' })
      await backend.authorizeAttempt(id, { providerSubject: 901, login: 'same-account', avatarUrl: 'https://avatars.example/user' })
      let checked = (): void => {}
      const checkReached = new Promise<void>((resolve) => { checked = resolve })
      const holdLogin = new Promise<void>((resolve) => { releaseLogin = resolve })
      const client = await runtime.pool.connect()
      const originalQuery = client.query.bind(client)
      // Pause only scheduling after the real PostgreSQL deletion lookup; every query and result remains real.
      client.query = new Proxy(originalQuery, {
        apply(target, receiver, args: unknown[]): unknown {
          const result: unknown = Reflect.apply(target, receiver, args)
          if (args[0] !== 'SELECT id FROM account_deletions WHERE account_id = $1 AND completed_at IS NULL') return result
          return Promise.resolve(result).then(async (value) => {
            checked()
            await holdLogin
            return value
          })
        },
      })
      client.release()
      login = backend.consumeAuthorizedAttempt(id, 'concurrent-refresh', Date.now() + 60_000)
      await checkReached
      let accepted = false
      deletion = backend.beginAccountDeletion({ operationId: parseAccountDeletionId('concurrent-deletion'),
        accountId: account.account.id, identityNamespace: 'gestalt-production', installationId: account.session.installationId,
        publicKey: account.session.publicKey, recoveryTokenHash: 'a'.repeat(43), successors: [], sessionIds: [],
        status: 'deleting', projects: [] }, account.session).then((record) => { accepted = true; return record })
      await vi.waitFor(async () => {
        if (accepted) return
        const blocked = await runtime.pool.query(
          "SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query = $1",
          ['SELECT id FROM account_accounts WHERE id = $1 FOR UPDATE'],
        )
        expect(blocked.rows.length).toBeGreaterThan(0)
      })
      releaseLogin()
      await login
      await deletion
      client.query = originalQuery
      const active = await runtime.pool.query('SELECT id FROM account_sessions WHERE account_id = $1 AND active = TRUE', [account.account.id])
      expect(active.rows).toEqual([])
      expect(await backend.getSessionByRefreshHash('concurrent-refresh')).toBeUndefined()
    } finally {
      releaseLogin()
      await Promise.allSettled([login, deletion])
      await runtime.close()
    }
  })

  it('serializes Mobile removal with authorized login consumption and refresh rotation', async () => {
    const runtime = await startPostgres()
    const backend = new PostgresAccountBackend('mobile-removal-race', runtime.pool)
    let releaseRemoval = (): void => {}
    let removal: Promise<readonly string[]> | undefined
    let login: Promise<CreatedSession> | undefined
    try {
      await backend.migrate()
      const desktop = await seedAccount(backend, 902)
      const target = await seedInstallation(
        backend,
        902,
        'managed-mobile',
        'mobile',
        'managed-mobile-session',
      )
      const authorizedId = parseLoginAttemptId('managed-mobile-authorized')
      await backend.createAttempt({
        id: authorizedId,
        environment: 'production',
        identityNamespace: 'gestalt-production',
        installationId: parseInstallationId('managed-mobile'),
        installationKind: 'mobile',
        presentation: { name: 'Authorized replacement', platform: 'android' },
        publicKey: target.session.publicKey,
        state: 'managed-mobile-authorized-state',
        codeVerifier: 'verifier',
        expiresAt: Date.now() + 60_000,
        status: 'pending',
      })
      await backend.authorizeAttempt(authorizedId, {
        providerSubject: 902,
        login: 'same-account',
        avatarUrl: 'https://avatars.example/user',
      })
      let locked = (): void => {}
      const accountLocked = new Promise<void>((resolve) => { locked = resolve })
      const holdRemoval = new Promise<void>((resolve) => { releaseRemoval = resolve })
      const client = await runtime.pool.connect()
      const originalQuery = client.query.bind(client)
      client.query = new Proxy(originalQuery, {
        apply(targetQuery, receiver, args: unknown[]): unknown {
          const result: unknown = Reflect.apply(targetQuery, receiver, args)
          if (args[0] !== 'SELECT id FROM account_accounts WHERE id = $1 FOR UPDATE') return result
          return Promise.resolve(result).then(async (value) => {
            locked()
            await holdRemoval
            return value
          })
        },
      })
      client.release()
      removal = backend.revokeMobileInstallation(desktop.session, parseInstallationId('managed-mobile'))
      await accountLocked
      login = backend.consumeAuthorizedAttempt(authorizedId, 'replacement-refresh', Date.now() + 60_000)
      await vi.waitFor(async () => {
        const blocked = await runtime.pool.query(
          "SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query = $1",
          ['SELECT * FROM account_attempts WHERE id = $1 FOR UPDATE'],
        )
        expect(blocked.rows.length).toBeGreaterThan(0)
      })
      releaseRemoval()
      await expect(removal).resolves.toEqual([target.session.id])
      await expect(login).rejects.toMatchObject({ code: 'LOGIN_ATTEMPT_USED' })
      client.query = originalQuery
      expect(await backend.getSessionByRefreshHash(target.session.refreshHash)).toBeUndefined()
      const reopened = new PostgresAccountBackend('mobile-removal-race', runtime.pool)
      await expect(reopened.pendingMobileSessionInvalidations('gestalt-production'))
        .resolves.toEqual([target.session.id])
      await expect(reopened.revokeMobileInstallation(
        desktop.session,
        parseInstallationId('managed-mobile'),
      )).resolves.toEqual([target.session.id])
      await reopened.completeMobileSessionInvalidation(target.session.id)
      await expect(backend.pendingMobileSessionInvalidations('gestalt-production')).resolves.toEqual([])

      const later = await seedInstallation(
        backend,
        902,
        'managed-mobile',
        'mobile',
        'managed-mobile-later',
      )
      const [rotation, laterRemoval] = await Promise.allSettled([
        backend.rotateRefresh(later.session.id, later.session.refreshHash, 'rotated-refresh'),
        backend.revokeMobileInstallation(desktop.session, parseInstallationId('managed-mobile')),
      ])
      expect(laterRemoval.status).toBe('fulfilled')
      expect(rotation.status).toBe('fulfilled')
      await expect(backend.getSession(later.session.id)).resolves.toMatchObject({ active: false, refreshHash: '' })
      expect(await backend.getSessionByRefreshHash('rotated-refresh')).toBeUndefined()

      const deletionId = parseAccountDeletionId('mobile-removal-outbox-retention')
      await backend.beginAccountDeletion({
        operationId: deletionId,
        accountId: desktop.account.id,
        identityNamespace: 'gestalt-production',
        installationId: desktop.session.installationId,
        publicKey: desktop.session.publicKey,
        recoveryTokenHash: 'a'.repeat(43),
        successors: [],
        sessionIds: [],
        status: 'deleting',
        projects: [],
      }, desktop.session)
      await backend.completeAccountDeletion(deletionId, Date.now())
      await expect(backend.getAccount(desktop.account.id)).resolves.toBeUndefined()
      await expect(backend.pendingMobileSessionInvalidations('gestalt-production'))
        .resolves.toEqual([later.session.id])
      await backend.completeMobileSessionInvalidation(later.session.id)
    } finally {
      releaseRemoval()
      await Promise.allSettled([removal, login].filter(value => value !== undefined))
      await runtime.close()
    }
  })

  it('recovers an unversioned pairing transaction in PostgreSQL without dropping confirmed pairings', async () => {
    const runtime = await startPostgres()
    try {
      const store = new PostgresPersonalPairingAuthorityStore('gestalt-production', runtime.pool)
      await store.migrate()
      await runtime.pool.query(
        `INSERT INTO remote_access_pairing_transactions (database_identity, state)
         VALUES ($1, $2::jsonb)`,
        ['gestalt-production', JSON.stringify(legacyTransactionDocument())],
      )

      await store.runPairingTransaction(async (state) => {
        expect(state.pairings.get(parsePersonalPairingId('pairing-legacy'))?.device.name).toBe('Preserved phone')
        expect(state.completions.size).toBe(0)
        expect(state.settledChallenges.get(parsePairingChallengeId('challenge-legacy'))?.outcome).toBe('completed')
        state.blobSequence.next = 12
      })

      const durable = await runtime.pool.query<{ state: unknown }>(
        `SELECT state FROM remote_access_pairing_transactions
          WHERE database_identity = $1`,
        ['gestalt-production'],
      )
      expect(durable.rows[0]?.state).toMatchObject({ formatVersion: 2, blobSequence: { next: 12 } })
    } finally {
      await runtime.close()
    }
  })
})

const LEGACY_SCHEMA = `
CREATE TABLE account_attempts (
  id text PRIMARY KEY, environment text NOT NULL, identity_namespace text NOT NULL,
  installation_id text NOT NULL, installation_kind text NOT NULL, public_key jsonb NOT NULL,
  state text NOT NULL UNIQUE, code_verifier text NOT NULL, expires_at bigint NOT NULL,
  status text NOT NULL, identity jsonb
);
CREATE TABLE account_accounts (
  id text PRIMARY KEY, identity_namespace text NOT NULL, github_id bigint NOT NULL,
  github_login text NOT NULL, avatar_url text NOT NULL, UNIQUE (identity_namespace, github_id)
);
CREATE TABLE account_sessions (
  id text PRIMARY KEY, identity_namespace text NOT NULL, account_id text NOT NULL,
  installation_id text NOT NULL, installation_kind text NOT NULL, public_key jsonb NOT NULL,
  revision integer NOT NULL, active boolean NOT NULL, refresh_hash text,
  refresh_expires_at bigint NOT NULL
);
CREATE TABLE account_proofs (jti text PRIMARY KEY, expires_at bigint NOT NULL);
`

function legacyTransactionDocument(): unknown {
  const state = emptyPairingTransactionState()
  const pairingId = parsePersonalPairingId('pairing-legacy')
  const principalId = parseDevicePrincipalId('principal-legacy')
  state.pairings.set(pairingId, {
    id: pairingId,
    devicePrincipal: {
      id: principalId,
      accountId: parsePlatformAccountId('account-legacy'),
      installationId: parseInstallationId('mobile-legacy'),
      authority: 'companion-surface',
    },
    device: { name: 'Preserved phone', platform: 'ios' },
    pairedAt: 2,
    lastAccessAt: 3,
    online: false,
    desktopInstallationId: parseInstallationId('desktop-legacy'),
    keyReference: parsePersonalPairingKeyReference('key-legacy'),
    cleanup: { resource: Uint8Array.of(1) },
  })
  state.principalIds.add(principalId)
  state.completions.set(parsePairingCompletionId('completion-legacy'), {
    accountId: 'account-legacy',
    desktopInstallationId: parseInstallationId('desktop-legacy'),
    mobileInstallationId: parseInstallationId('mobile-legacy'),
    challengeId: parsePairingChallengeId('challenge-legacy'),
    requestDigest: new Uint8Array(32).fill(7),
    challengeCleanup: { resource: Uint8Array.of(2) },
    view: {
      pendingPairingId: parsePendingPairingId('pending-legacy'),
      authenticationWords: ['amber', 'binary', 'cedar', 'delta', 'ember', 'frost'],
      desktopHandshake: Uint8Array.of(3),
      device: { name: 'Legacy pending phone', platform: 'android' },
    },
    completedAt: 10,
  })
  const document = structuredClone(encodePairingTransactionState(state)) as {
    formatVersion?: unknown
    completions: Array<[string, Record<string, unknown>]>
  }
  delete document.formatVersion
  for (const [, completion] of document.completions) delete completion.requestDigest
  return document
}

async function seedAccount(backend: PostgresAccountBackend, providerSubject: number): Promise<CreatedSession> {
  return await seedInstallation(
    backend,
    providerSubject,
    `seed-installation-${String(providerSubject)}`,
    'desktop',
    `seed-${String(providerSubject)}`,
  )
}

async function seedInstallation(
  backend: PostgresAccountBackend,
  providerSubject: number,
  installationId: string,
  installationKind: 'desktop' | 'mobile',
  attemptId: string,
): Promise<CreatedSession> {
  const id = parseLoginAttemptId(attemptId)
  const publicKey = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' })
  await backend.createAttempt({ id, environment: 'production', identityNamespace: 'gestalt-production',
    installationId: parseInstallationId(installationId), installationKind,
    presentation: installationKind === 'desktop'
      ? { name: 'Write fence', platform: 'linux' }
      : { name: 'Managed mobile', platform: 'ios' },
    publicKey, state: `${attemptId}-state`,
    codeVerifier: 'fixture-verifier', expiresAt: Date.now() + 60_000, status: 'pending' })
  await backend.authorizeAttempt(id, { providerSubject, login: `user-${String(providerSubject)}`, avatarUrl: 'https://avatars.example/user' })
  return await backend.consumeAuthorizedAttempt(id, `refresh-${attemptId}`, Date.now() + 60_000)
}

async function startPostgres(): Promise<{ pool: pg.Pool; close(): Promise<void> }> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-account-pg-'))
  const initialized = spawnSync('initdb', ['-D', directory, '-A', 'trust', '--no-locale'], {
    encoding: 'utf8',
  })
  if (initialized.status !== 0) {
    await rm(directory, { recursive: true, force: true })
    throw new Error(`initdb failed: ${initialized.stderr}`)
  }
  const server = spawn('postgres', ['-D', directory, '-k', directory, '-h', '', '-p', '5432'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  server.stderr?.on('data', (chunk) => { stderr += String(chunk) })
  const pool = new pg.Pool({ host: directory, port: 5432, user: process.env.USER, database: 'postgres' })
  await waitForPostgres(server, pool, () => stderr)
  return {
    pool,
    close: async () => {
      await pool.end()
      await stopProcess(server)
      await rm(directory, { recursive: true, force: true })
    },
  }
}

async function waitForPostgres(process: ChildProcess, pool: pg.Pool, stderr: () => string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (process.exitCode !== null) throw new Error(`postgres exited before readiness: ${stderr()}`)
    try {
      await pool.query('SELECT 1')
      return
    } catch {
      // The disposable server has not opened its Unix socket yet.
    }
    await new Promise<void>((resolve) => { setTimeout(resolve, 20) })
  }
  await stopProcess(process)
  throw new Error('postgres did not accept a connection')
}

async function stopProcess(process: ChildProcess): Promise<void> {
  if (process.exitCode !== null) return
  const exited = new Promise<void>((resolve) => { process.once('exit', () => { resolve() }) })
  process.kill('SIGTERM')
  await exited
}
