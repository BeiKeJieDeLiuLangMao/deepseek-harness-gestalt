/** Host Session materialization for authenticated member-question arrivals. */

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentFactory, CreateAgentOptions } from '@deepseek-ai/dsh-agent'
import FileMemberQuestionReceiver from '@deepseek-ai/dsh-member-question-receiver'
import type { PlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import {
  parseCompanionOperationId,
  parseCompanionSessionId,
  parseMemberQuestionId,
  parseMemberQuestionProjectId,
} from '@deepseek-ai/dsh-remote-protocol'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import { ApiSessionAgentController } from '../src/agent.ts'
import { installReceivingSessionMaterializer } from '../src/receiving-materializer.ts'
import { createSessionTestController } from './test-remote.ts'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  for (const context of contexts.splice(0).reverse()) await context.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

const envelope = {
  authority: { accountId: 'account-receiver' as PlatformAccountId },
  operation: {
    type: 'member-question' as const,
    operationId: parseCompanionOperationId('operation-materialize'),
    questionId: parseMemberQuestionId('question-materialize'),
    projectId: parseMemberQuestionProjectId('project-1'),
    originSessionId: parseCompanionSessionId('origin-session-1'),
    expiresAt: 9_000,
    origin: {
      projectName: 'Atlas',
      originSessionTitle: 'Choose storage',
      askerAccountId: 'account-asker',
      askerRole: 'owner' as const,
      askerDisplayName: 'Ada',
      askerAvatarUrl: 'https://example.test/ada.png',
    },
    background: 'Choose the durable owner.',
    questions: [{ id: 'choice', question: 'Which owner?' }],
    references: [{ path: 'docs/architecture.md', reason: 'Current ownership map' }],
  },
}

function stubAgent(session: Session): Agent {
  return {
    id: session.id,
    options: {},
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'idle',
    ctx: new Context(),
    send: () => {},
    followup: () => {},
    steer: () => ({ outcome: Promise.resolve({ status: 'rejected' as const }) }),
    inject: () => {},
    cancel() {},
    runMaintenance: job => job(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

async function harness(): Promise<{
  ctx: Context
  receiver: FileMemberQuestionReceiver
  workspaceId: string
  workspacePath: string
  jsonlRoot: string
}> {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-receiving-materializer-')))
  roots.push(root)
  const jsonlRoot = join(root, 'sessions')
  const workspacePath = join(root, 'workspace')
  mkdirSync(workspacePath)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(JsonlSessionPersistence, { root: jsonlRoot, compression: 'none' })
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  await ctx.plugin(WorkspaceRegistry)
  const factory: AgentFactory = {
    async createAgent(ownerCtx: Context, options: CreateAgentOptions) {
      const session = ctx.sessions.create(options.sessionId, {
        ...options.meta === undefined ? {} : { meta: options.meta },
      })
      const handle = await ctx.sessionPersistence.create(session.header)
      const agent = stubAgent(session)
      const unregister = ctx.agents.register(agent)
      void ownerCtx
      return {
        agent,
        dispose: async () => {
          unregister()
          await handle.close()
        },
      }
    },
    resume: () => Promise.reject(new Error('receiving materializer tests keep sources live')),
  }
  ctx.agents.setFactory(factory)
  await ctx.plugin(FileMemberQuestionReceiver, {
    storagePath: join(root, 'receiver'),
    environment: 'development',
    maxRecords: 16,
    terminalRetryMs: 10,
    clock: () => 1_000,
  })
  createSessionTestController(ctx, {
    defaultModelSelection: () => ({ provider: 'fixture', model: 'fixture-model' }),
    cwd: workspacePath,
  })
  const workspace = await ctx.workspaceRegistry.create(workspacePath)
  const receiver = ctx.memberQuestionReceiver as FileMemberQuestionReceiver
  await receiver.bind(
    envelope.authority.accountId,
    envelope.operation.projectId,
    workspace.id,
  )
  return { ctx, receiver, workspaceId: workspace.id, workspacePath, jsonlRoot }
}

describe('Session Controller receiving materializer', () => {
  it('materializes the receiver Session identity onto JSONL from authenticated ingest', async () => {
    const { ctx, receiver, jsonlRoot } = await harness()
    const arrived = await receiver.ingest(envelope)
    const replayed = await receiver.ingest(envelope)
    expect(replayed.receivingSessionId).toBe(arrived.receivingSessionId)
    const snapshot = await receiver.snapshot()
    expect(snapshot.pending).toHaveLength(1)
    expect(snapshot.pending[0]).toMatchObject({
      questionId: envelope.operation.questionId,
      receivingSessionId: arrived.receivingSessionId,
      hostSessionId: arrived.receivingSessionId,
    })
    const live = ctx.sessions.get(arrived.receivingSessionId as unknown as SessionId)
    const received = live?.snapshotEvents().filter(event => event.type === 'member-question/received')
    expect(received).toHaveLength(1)
    expect(received?.[0]).toMatchObject({
      type: 'member-question/received',
      ignorable: true,
      data: { questionId: envelope.operation.questionId },
    })
    expect(ctx.agents.get(arrived.receivingSessionId as unknown as SessionId)?.status).toBe('idle')

    const reader = new Context()
    contexts.push(reader)
    await reader.plugin(SessionStore)
    await reader.plugin(JsonlSessionPersistence, { root: jsonlRoot, compression: 'none' })
    const stored = await reader.sessionPersistence.open(
      arrived.receivingSessionId as unknown as SessionId,
      'read',
    )
    try {
      const events = await stored.read()
      expect(stored.header.id).toBe(arrived.receivingSessionId)
      expect(events.filter(event => event.type === 'member-question/received')).toHaveLength(1)
    } finally {
      await stored.close()
    }
  })

  it('writes transferred bytes under a hidden receiver-owned path and leaves the Workspace file unchanged', async () => {
    const { ctx, receiver, workspacePath } = await harness()
    const localPath = join(workspacePath, 'docs', 'architecture.md')
    mkdirSync(join(workspacePath, 'docs'))
    writeFileSync(localPath, 'LOCAL WORKSPACE COPY\n')
    const arrived = await receiver.ingest({
      ...envelope,
      documents: [{ path: 'docs/architecture.md', bytes: Buffer.from('# transferred brief\n') }],
    })
    expect(readFileSync(localPath, 'utf8')).toBe('LOCAL WORKSPACE COPY\n')
    expect(readFileSync(join(workspacePath, '.dsh', 'member-questions', 'question-materialize', 'architecture.md'), 'utf8'))
      .toBe('# transferred brief\n')
    const session = ctx.sessions.get(arrived.receivingSessionId as unknown as SessionId)
    expect(session?.snapshotEvents().find(event => event.type === 'member-question/received')?.data)
      .toMatchObject({
        cachedReferences: [{
          path: 'docs/architecture.md',
          cachedPath: '.dsh/member-questions/question-materialize/architecture.md',
        }],
      })
  })

  it('withdraws the materializer so a later Host owner can replace it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-receiving-materializer-unload-'))
    roots.push(root)
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(FileMemberQuestionReceiver, {
      storagePath: join(root, 'receiver'),
      environment: 'development',
      maxRecords: 8,
      terminalRetryMs: 10,
    })
    const unregister = installReceivingSessionMaterializer(ctx, {
      ensureSession: () => Promise.reject(new Error('unused')),
    } as ApiSessionAgentController)
    expect(unregister).toEqual(expect.any(Function))
    expect(() => ctx.memberQuestionReceiver.registerSessionMaterializer(async () => ({ accepted: true as const })))
      .toThrow('already registered')
    unregister?.()
    const replacement = ctx.memberQuestionReceiver.registerSessionMaterializer(async () => ({ accepted: true as const }))
    replacement()
  })
})
