/** Host Session materialization for authenticated member-question arrivals. */

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import FileMemberQuestionReceiver from '@deepseek-ai/dsh-member-question-receiver'
import type {
  MemberQuestionTerminalAuthority,
  MemberQuestionTerminalClaim,
} from '@deepseek-ai/dsh-member-question-receiver'
import type { PlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import {
  parseCompanionOperationId,
  parseCompanionSessionId,
  parseMemberQuestionId,
  parseMemberQuestionProjectId,
} from '@deepseek-ai/dsh-remote-protocol'
import SessionStore, { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { MockAdapter } from '../../../core/agent-loop/tests/mock-adapter.ts'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
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

class MemoryTerminalAuthority implements MemberQuestionTerminalAuthority {
  readonly terminals = new Map<string, MemberQuestionTerminalClaim['terminal']>()

  async claim(candidate: MemberQuestionTerminalClaim['terminal']): Promise<MemberQuestionTerminalClaim> {
    const prior = this.terminals.get(candidate.questionId)
    if (prior !== undefined) return { claimed: false, terminal: prior }
    this.terminals.set(candidate.questionId, candidate)
    return { claimed: true, terminal: candidate }
  }
}

class ManualTimer {
  readonly pending: Array<{ callback: () => void; delayMs: number }> = []

  set(callback: () => void, delayMs: number): unknown {
    const handle = { callback, delayMs }
    this.pending.push(handle)
    return handle
  }

  clear(handle: unknown): void {
    const index = this.pending.indexOf(handle as typeof this.pending[number])
    if (index >= 0) this.pending.splice(index, 1)
  }

  fire(): void {
    const next = this.pending.shift()
    if (next === undefined) throw new Error('no timer scheduled')
    next.callback()
  }
}

async function harness(options: {
  readonly terminalAuthority?: MemberQuestionTerminalAuthority
  readonly receivingTerminalTimer?: ManualTimer
} = {}): Promise<{
  ctx: Context
  receiver: FileMemberQuestionReceiver
  workspaceId: string
  workspacePath: string
  jsonlRoot: string
  adapter: MockAdapter
  timer: ManualTimer | undefined
}> {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-receiving-materializer-')))
  roots.push(root)
  const jsonlRoot = join(root, 'sessions')
  const workspacePath = join(root, 'workspace')
  mkdirSync(workspacePath)
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: jsonlRoot, compression: 'none' })
  await ctx.plugin(AgentLoop, { agents: [] })
  const adapter = new MockAdapter([])
  ctx.llm.registerAdapter(['mock'], adapter)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  await ctx.plugin(WorkspaceRegistry)
  await ctx.plugin(FileMemberQuestionReceiver, {
    storagePath: join(root, 'receiver'),
    environment: 'development',
    maxRecords: 16,
    terminalRetryMs: 10,
    clock: () => 1_000,
    ...options.terminalAuthority === undefined ? {} : { terminalAuthority: options.terminalAuthority },
  })
  createSessionTestController(ctx, {
    defaultModelSelection: () => ({ provider: 'mock', model: 'mock' }),
    cwd: workspacePath,
    receivingTerminalRetryMs: 5,
    ...options.receivingTerminalTimer === undefined
      ? {}
      : { receivingTerminalTimer: options.receivingTerminalTimer },
  })
  const workspace = await ctx.workspaceRegistry.create(workspacePath)
  const receiver = ctx.memberQuestionReceiver as FileMemberQuestionReceiver
  await receiver.bind(
    envelope.authority.accountId,
    envelope.operation.projectId,
    workspace.id,
  )
  return {
    ctx,
    receiver,
    workspaceId: workspace.id,
    workspacePath,
    jsonlRoot,
    adapter,
    timer: options.receivingTerminalTimer,
  }
}

describe('Session Controller receiving materializer', () => {
  it('materializes the receiver Session identity onto JSONL from authenticated ingest', async () => {
    const { ctx, receiver, jsonlRoot, adapter } = await harness()
    const create = vi.spyOn(ctx.sessionPersistence, 'create')
    const arrived = await receiver.ingest(envelope)
    const replayed = await receiver.ingest(envelope)
    expect(replayed.receivingSessionId).toBe(arrived.receivingSessionId)
    expect(create).toHaveBeenCalledTimes(1)
    const snapshot = await receiver.snapshot()
    expect(snapshot.pending).toHaveLength(1)
    expect(snapshot.pending[0]).toMatchObject({
      questionId: envelope.operation.questionId,
      receivingSessionId: arrived.receivingSessionId,
      hostSessionId: arrived.receivingSessionId,
    })
    const live = ctx.sessions.get(arrived.receivingSessionId as unknown as SessionId)
    const events = live?.snapshotEvents() ?? []
    const received = events.filter(event => event.type === 'member-question/received')
    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({
      type: 'member-question/received',
      ignorable: true,
      data: { questionId: envelope.operation.questionId },
    })
    const brief = events.filter(
      (event): event is SessionEvent<'agent/inbox/spliced'> => event.type === 'agent/inbox/spliced'
        && event.data.inserted.some(message => message.id === `member-question-brief:${envelope.operation.questionId}`),
    )
    expect(brief).toHaveLength(1)
    expect(brief[0]?.data.inserted[0]?.content).toEqual([{
      type: 'text',
      text: expect.stringContaining('Decision Brief from Ada') as unknown,
    }])
    expect(events.filter(event => event.type === 'turn/start')).toHaveLength(0)
    const agent = ctx.agents.get(arrived.receivingSessionId as unknown as SessionId)
    expect(agent?.status).toBe('idle')
    expect(adapter.requests).toEqual([])

    const reader = new Context()
    contexts.push(reader)
    await reader.plugin(SessionStore)
    await reader.plugin(JsonlSessionPersistence, { root: jsonlRoot, compression: 'none' })
    const stored = await reader.sessionPersistence.open(
      arrived.receivingSessionId as unknown as SessionId,
      'read',
    )
    try {
      const persisted = (await stored.read()).events
      expect(stored.header.id).toBe(arrived.receivingSessionId)
      expect(persisted.filter(event => event.type === 'member-question/received')).toHaveLength(1)
      expect(persisted.filter(event => event.type === 'agent/inbox/spliced'
        && event.data.inserted.some(message => message.id === `member-question-brief:${envelope.operation.questionId}`)))
        .toHaveLength(1)
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

  it('keeps materialized false when arrival flush fails and retries to the same Session', async () => {
    const { ctx, receiver, adapter } = await harness()
    const create = vi.spyOn(ctx.sessionPersistence, 'create')
    const flush = vi.spyOn(ctx.sessions, 'flush')
    flush.mockRejectedValueOnce(new Error('injected arrival flush failure'))
    await expect(receiver.ingest(envelope)).rejects.toThrow('injected arrival flush failure')
    expect((await receiver.snapshot()).pending[0]?.hostSessionId).toBeUndefined()
    expect(adapter.requests).toEqual([])
    expect(create).toHaveBeenCalledTimes(1)
    flush.mockRestore()
    const arrived = await receiver.ingest(envelope)
    expect((await receiver.snapshot()).pending[0]?.hostSessionId).toBe(arrived.receivingSessionId)
    expect(create).toHaveBeenCalledTimes(1)
    const session = ctx.sessions.get(arrived.receivingSessionId as unknown as SessionId)
    expect(session?.snapshotEvents().filter(event => event.type === 'member-question/received')).toHaveLength(1)
    expect(session?.snapshotEvents().filter(event => event.type === 'agent/inbox/spliced'
      && event.data.inserted.some(message => message.id === `member-question-brief:${envelope.operation.questionId}`)))
      .toHaveLength(1)
    expect(ctx.agents.get(arrived.receivingSessionId as unknown as SessionId)?.status).toBe('idle')
    expect(adapter.requests).toEqual([])
  })

  it('refuses to create a dark Session for an unmaterialized receiving identity', async () => {
    const { ctx } = await harness()
    const sessionId = SessionId('receiving-unmaterialized')
    const agents = new ApiSessionAgentController(ctx)
    await expect(agents.resumeExistingSession(sessionId, ctx.workspaceRegistry.list()[0]!.path))
      .rejects.toThrow(`member-question Session "${sessionId}" is not materialized`)
    expect(ctx.sessions.get(sessionId)).toBeUndefined()
    expect(ctx.agents.get(sessionId)).toBeUndefined()
  })

  it('appends one ignorable settled event when the receiver terminal commits', async () => {
    const { ctx, receiver } = await harness({ terminalAuthority: new MemoryTerminalAuthority() })
    const create = vi.spyOn(ctx.sessionPersistence, 'create')
    const arrived = await receiver.ingest(envelope)
    await receiver.settle(envelope.operation.questionId, {
      kind: 'declined',
      settledByInstallationId: 'installation-local' as never,
      settledByDeviceName: 'Local Mac',
      settledAt: 1_100,
    })
    await vi.waitFor(() => {
      const events = ctx.sessions.get(arrived.receivingSessionId as unknown as SessionId)
        ?.snapshotEvents().filter(event => event.type === 'member-question/settled')
      expect(events).toHaveLength(1)
    })
    const session = ctx.sessions.get(arrived.receivingSessionId as unknown as SessionId)
    expect(session?.snapshotEvents().filter(event => event.type === 'member-question/settled')).toHaveLength(1)
    expect(session?.snapshotEvents().find(event => event.type === 'member-question/settled')).toMatchObject({
      ignorable: true,
      data: { outcome: 'declined', questionId: envelope.operation.questionId },
    })
    await receiver.settle(envelope.operation.questionId, {
      kind: 'declined',
      settledByInstallationId: 'installation-local' as never,
      settledByDeviceName: 'Local Mac',
      settledAt: 1_200,
    })
    await Promise.resolve()
    expect(create).toHaveBeenCalledTimes(1)
    expect(session?.snapshotEvents().filter(event => event.type === 'member-question/settled')).toHaveLength(1)
  })

  it('retries a failed terminal flush without duplicating the settled event', async () => {
    const timer = new ManualTimer()
    const { ctx, receiver } = await harness({
      terminalAuthority: new MemoryTerminalAuthority(),
      receivingTerminalTimer: timer,
    })
    const arrived = await receiver.ingest(envelope)
    const sessionId = arrived.receivingSessionId as unknown as SessionId
    const flush = vi.spyOn(ctx.sessions, 'flush')
    flush.mockRejectedValueOnce(new Error('injected flush failure'))
    await receiver.settle(envelope.operation.questionId, {
      kind: 'declined',
      settledByInstallationId: 'installation-local' as never,
      settledByDeviceName: 'Local Mac',
      settledAt: 1_100,
    })
    await vi.waitFor(() => { expect(flush).toHaveBeenCalled() })
    expect(ctx.sessions.get(sessionId)?.snapshotEvents()
      .filter(event => event.type === 'member-question/settled')).toHaveLength(1)
    timer.fire()
    await vi.waitFor(() => { expect(flush.mock.calls.length).toBeGreaterThanOrEqual(2) })
    expect(ctx.sessions.get(sessionId)?.snapshotEvents()
      .filter(event => event.type === 'member-question/settled')).toHaveLength(1)
  })

  it('replays durable terminals onto JSONL after Host restart', async () => {
    const first = await harness({ terminalAuthority: new MemoryTerminalAuthority() })
    const arrived = await first.receiver.ingest(envelope)
    await first.receiver.settle(envelope.operation.questionId, {
      kind: 'declined',
      settledByInstallationId: 'installation-local' as never,
      settledByDeviceName: 'Local Mac',
      settledAt: 1_100,
    })
    await vi.waitFor(() => {
      expect(first.ctx.sessions.get(arrived.receivingSessionId as unknown as SessionId)
        ?.snapshotEvents().some(event => event.type === 'member-question/settled')).toBe(true)
    })
    const jsonlRoot = first.jsonlRoot
    const workspacePath = first.workspacePath
    const receiverRoot = join(jsonlRoot, '..', 'receiver')
    await first.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(first.ctx), 1)

    const ctx = new Context()
    contexts.push(ctx)
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(JsonlSessionPersistence, { root: jsonlRoot, compression: 'none' })
    await ctx.plugin(AgentLoop, { agents: [] })
    ctx.llm.registerAdapter(['mock'], new MockAdapter([]))
    await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', new MemoryStorageBackend())
    const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
    ctx.storage.mount('domain', storageDomain)
    ctx.provide('storageDomain', storageDomain)
    await ctx.plugin(WorkspaceRegistry)
    await ctx.plugin(FileMemberQuestionReceiver, {
      storagePath: receiverRoot,
      environment: 'development',
      maxRecords: 16,
      terminalRetryMs: 10,
      clock: () => 2_000,
      terminalAuthority: new MemoryTerminalAuthority(),
    })
    const workspace = await ctx.workspaceRegistry.resolveByPath(workspacePath)
      ?? await ctx.workspaceRegistry.create(workspacePath)
    const restarted = ctx.memberQuestionReceiver as FileMemberQuestionReceiver
    await restarted.bind(
      envelope.authority.accountId,
      envelope.operation.projectId,
      workspace.id,
    )
    const create = vi.spyOn(ctx.sessionPersistence, 'create')
    const open = vi.spyOn(ctx.sessionPersistence, 'open')
    createSessionTestController(ctx, {
      defaultModelSelection: () => ({ provider: 'mock', model: 'mock' }),
      cwd: workspacePath,
    })
    await vi.waitFor(() => {
      const session = ctx.sessions.get(arrived.receivingSessionId as unknown as SessionId)
      expect(session?.snapshotEvents().filter(event => event.type === 'member-question/settled')).toHaveLength(1)
    })
    expect(create).not.toHaveBeenCalled()
    expect(open.mock.calls.filter(([, mode]) => mode === 'write').map(([id, mode]) => [id, mode])).toEqual([
      [arrived.receivingSessionId, 'write'],
    ])
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
    await ctx.plugin(TypertRegistry)
    const unregister = installReceivingSessionMaterializer(ctx, new ApiSessionAgentController(ctx))
    expect(unregister).toEqual(expect.any(Function))
    expect(() => ctx.memberQuestionReceiver.registerSessionMaterializer(async () => ({ accepted: true as const })))
      .toThrow('already registered')
    expect(() => ctx.memberQuestionReceiver.registerHumanTurnAdmitter(async () => ({ accepted: true as const })))
      .toThrow('already registered')
    await unregister()
    const replacement = ctx.memberQuestionReceiver.registerSessionMaterializer(async () => ({ accepted: true as const }))
    replacement()
    const replacementAdmitter = ctx.memberQuestionReceiver.registerHumanTurnAdmitter(async () => ({ accepted: true as const }))
    replacementAdmitter()
  })

  it('keeps SessionController active without a receiver and installs after that service appears', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-receiving-materializer-optional-'))
    roots.push(root)
    const workspacePath = join(root, 'workspace')
    mkdirSync(workspacePath)
    const ctx = new Context()
    contexts.push(ctx)
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
    await ctx.plugin(AgentLoop, { agents: [] })
    ctx.llm.registerAdapter(['mock'], new MockAdapter([]))
    await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', new MemoryStorageBackend())
    const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
    ctx.storage.mount('domain', storageDomain)
    ctx.provide('storageDomain', storageDomain)
    await ctx.plugin(WorkspaceRegistry)
    const controller = createSessionTestController(ctx, {
      defaultModelSelection: () => ({ provider: 'mock', model: 'mock' }),
      cwd: workspacePath,
    })
    expect(ctx.get('memberQuestionReceiver')).toBeUndefined()
    expect(controller.typertRemote.namespace).toBe('session')
    const firstReceiver = await ctx.plugin(FileMemberQuestionReceiver, {
      storagePath: join(root, 'receiver'),
      environment: 'development',
      maxRecords: 8,
      terminalRetryMs: 10,
    })
    await vi.waitFor(() => {
      expect(() => ctx.memberQuestionReceiver.registerSessionMaterializer(async () => ({ accepted: true as const })))
        .toThrow('already registered')
      expect(() => ctx.memberQuestionReceiver.registerHumanTurnAdmitter(async () => ({ accepted: true as const })))
        .toThrow('already registered')
    })
    await firstReceiver.dispose()
    expect(ctx.get('memberQuestionReceiver')).toBeUndefined()
    await ctx.plugin(FileMemberQuestionReceiver, {
      storagePath: join(root, 'receiver'),
      environment: 'development',
      maxRecords: 8,
      terminalRetryMs: 10,
    })
    await vi.waitFor(() => {
      expect(() => ctx.memberQuestionReceiver.registerSessionMaterializer(async () => ({ accepted: true as const })))
        .toThrow('already registered')
    })
  })
})
