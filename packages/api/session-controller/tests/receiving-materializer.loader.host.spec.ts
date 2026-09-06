/** Loader composition for receiving Session materialization on a real AgentLoop Agent. */

import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentDefaultModelConfig from '@deepseek-ai/dsh-agent-default-model'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import LocalFileReferenceService from '@deepseek-ai/dsh-file-reference-local'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import FileMemberQuestionReceiver from '@deepseek-ai/dsh-member-question-receiver'
import type { PlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import {
  parseCompanionOperationId,
  parseCompanionSessionId,
  parseMemberQuestionId,
  parseMemberQuestionProjectId,
} from '@deepseek-ai/dsh-remote-protocol'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SqliteSessionQueryEngine from '@deepseek-ai/dsh-session-query-sqlite'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import SessionController from '../src/index.ts'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

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
    operationId: parseCompanionOperationId('operation-loader'),
    questionId: parseMemberQuestionId('question-loader'),
    projectId: parseMemberQuestionProjectId('project-loader'),
    originSessionId: parseCompanionSessionId('origin-loader'),
    expiresAt: Date.now() + 60_000,
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

function compositionYaml(root: string): string {
  return [
    "- name: '@deepseek-ai/dsh-llm'",
    "- name: '@deepseek-ai/dsh-session'",
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-agent'",
    "- name: '@deepseek-ai/dsh-session-projection'",
    "- name: '@deepseek-ai/dsh-typert-registry'",
    "- name: '@deepseek-ai/dsh-api-gateway'",
    "- name: '@deepseek-ai/dsh-agent-default-model'",
    '  config:',
    '    provider: mock',
    '    model: mock',
    "- name: '@deepseek-ai/dsh-session-persistence-jsonl'",
    '  config:',
    `    root: ${JSON.stringify(join(root, 'sessions'))}`,
    '    compression: none',
    "- name: '@deepseek-ai/dsh-attachment-local'",
    '  config:',
    `    dshHome: ${JSON.stringify(join(root, 'dsh-home'))}`,
    "- name: '@deepseek-ai/dsh-session-query-sqlite'",
    '  config:',
    "    path: ':memory:'",
    '    openAt: never',
    "- name: '@deepseek-ai/dsh-storage'",
    "- name: '@deepseek-ai/dsh-storage-json'",
    '  config:',
    `    root: ${JSON.stringify(join(root, 'storage'))}`,
    "- name: '@deepseek-ai/dsh-storage-domain'",
    '  config:',
    '    backend: json',
    "- name: '@deepseek-ai/dsh-workspace'",
    "- name: '@deepseek-ai/dsh-file-reference-local'",
    "- name: '@deepseek-ai/dsh-agent-loop'",
    '  config:',
    '    agents: []',
    "- name: '@deepseek-ai/dsh-member-question-receiver'",
    '  config:',
    `    storagePath: ${JSON.stringify(join(root, 'receiver'))}`,
    "    environment: 'development'",
    '    maxRecords: 16',
    '    terminalRetryMs: 10',
    "    terminalAuthorityMode: 'development-local'",
    "- name: '@deepseek-ai/dsh-api-session-controller'",
    '  config:',
    '    receivingTerminalRetryMs: 20',
    '',
  ].join('\n')
}

async function boot(): Promise<{
  ctx: Context
  adapter: MockAdapter
  workspacePath: string
  jsonlRoot: string
}> {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-receiving-materializer-loader-')))
  roots.push(root)
  const workspacePath = join(root, 'workspace')
  mkdirSync(workspacePath)
  mkdirSync(join(root, 'dsh-home'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, compositionYaml(root))
  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = `${pathToFileURL(root).href}/`
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-llm', LlmRuntime],
    ['@deepseek-ai/dsh-session', SessionStore],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-agent', AgentRegistry],
    ['@deepseek-ai/dsh-session-projection', SessionProjectionRegistry],
    ['@deepseek-ai/dsh-typert-registry', TypertRegistry],
    ['@deepseek-ai/dsh-api-gateway', TypertGatewayService],
    ['@deepseek-ai/dsh-agent-default-model', AgentDefaultModelConfig],
    ['@deepseek-ai/dsh-session-persistence-jsonl', JsonlSessionPersistence],
    ['@deepseek-ai/dsh-attachment-local', LocalAttachmentStore],
    ['@deepseek-ai/dsh-session-query-sqlite', SqliteSessionQueryEngine],
    ['@deepseek-ai/dsh-storage', Storage],
    ['@deepseek-ai/dsh-storage-json', StorageJson],
    ['@deepseek-ai/dsh-storage-domain', StorageDomain],
    ['@deepseek-ai/dsh-workspace', WorkspaceRegistry],
    ['@deepseek-ai/dsh-file-reference-local', LocalFileReferenceService],
    ['@deepseek-ai/dsh-agent-loop', AgentLoop],
    ['@deepseek-ai/dsh-member-question-receiver', FileMemberQuestionReceiver],
    ['@deepseek-ai/dsh-api-session-controller', SessionController],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  const unloaded = [...ctx.loader.entries()]
    .filter(entry => entry.fiber === undefined && !entry.disabled)
    .map(entry => entry.options.name)
  expect(unloaded).toEqual([])
  const adapter = new MockAdapter([
    textResponse('acknowledged the brief'),
    textResponse('acknowledged the image'),
  ])
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter, workspacePath, jsonlRoot: join(root, 'sessions') }
}

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function invokeAdmit(
  ctx: Context,
  request: {
    receivingSessionId: string
    revision: number
    requestId: string
    content: readonly Record<string, unknown>[]
    mode: 'queue' | 'steer'
  },
): Promise<{ accepted: true; receivingSessionId: string; rpcId: string; revision: number }> {
  return ctx.typertGateway.invoke({
    namespace: 'memberQuestion',
    method: 'admitHumanTurn',
    args: { request },
  }) as Promise<{ accepted: true; receivingSessionId: string; rpcId: string; revision: number }>
}

function waitForIdle(ctx: Context, sessionId: SessionId): Promise<void> {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent, status }) => {
      if (agent.id === sessionId && status === 'idle') {
        dispose()
        resolve()
      }
    })
  })
}

describe('receiving materializer through a real Loader composition', () => {
  it('injects the Decision Brief on a real AgentLoop Agent without waking a model turn', async () => {
    const { ctx, adapter, workspacePath, jsonlRoot } = await boot()
    const workspace = await ctx.workspaceRegistry.create(workspacePath)
    const receiver = ctx.memberQuestionReceiver as FileMemberQuestionReceiver
    await receiver.bind(envelope.authority.accountId, envelope.operation.projectId, workspace.id)
    const arrived = await receiver.ingest(envelope)
    const replayed = await receiver.ingest(envelope)
    expect(replayed.receivingSessionId).toBe(arrived.receivingSessionId)
    const sessionId = arrived.receivingSessionId as unknown as SessionId
    const events = ctx.sessions.get(sessionId)?.snapshotEvents() ?? []
    expect(events.filter(event => event.type === 'member-question/received')).toHaveLength(1)
    expect(events.filter(event => event.type === 'agent/inbox/spliced'
      && event.data.inserted.some(message => message.id === `member-question-brief:${envelope.operation.questionId}`)))
      .toHaveLength(1)
    expect(events.filter(event => event.type === 'turn/start')).toHaveLength(0)
    expect(ctx.agents.get(sessionId)?.status).toBe('idle')
    expect(adapter.requests).toEqual([])

    const reader = new Context()
    contexts.push(reader)
    await reader.plugin(SessionStore)
    await reader.plugin(JsonlSessionPersistence, { root: jsonlRoot, compression: 'none' })
    const stored = await reader.sessionPersistence.open(sessionId, 'read')
    try {
      const persisted = await stored.read()
      expect(stored.header.id).toBe(arrived.receivingSessionId)
      expect(persisted.filter(event => event.type === 'member-question/received')).toHaveLength(1)
      expect(persisted.filter(event => event.type === 'agent/inbox/spliced'
        && event.data.inserted.some(message => message.id === `member-question-brief:${envelope.operation.questionId}`)))
        .toHaveLength(1)
    } finally {
      await stored.close()
    }
  })

  it('appends one ignorable settled event after Loader-owned terminal commit', async () => {
    const { ctx, adapter, workspacePath } = await boot()
    const workspace = await ctx.workspaceRegistry.create(workspacePath)
    const receiver = ctx.memberQuestionReceiver as FileMemberQuestionReceiver
    await receiver.bind(envelope.authority.accountId, envelope.operation.projectId, workspace.id)
    const arrived = await receiver.ingest(envelope)
    await receiver.settle(envelope.operation.questionId, {
      kind: 'declined',
      settledByInstallationId: 'installation-local' as never,
      settledByDeviceName: 'Local Mac',
      settledAt: 1_100,
    })
    await vi.waitFor(() => {
      expect(ctx.sessions.get(arrived.receivingSessionId as unknown as SessionId)
        ?.snapshotEvents().filter(event => event.type === 'member-question/settled')).toHaveLength(1)
    })
    expect(adapter.requests).toEqual([])
    expect(ctx.agents.get(arrived.receivingSessionId as unknown as SessionId)?.status).toBe('idle')
  })

  it('retries a failed terminal flush on the configured production timer without duplicating settled', async () => {
    const { ctx, adapter, workspacePath } = await boot()
    const workspace = await ctx.workspaceRegistry.create(workspacePath)
    const receiver = ctx.memberQuestionReceiver as FileMemberQuestionReceiver
    await receiver.bind(envelope.authority.accountId, envelope.operation.projectId, workspace.id)
    const arrived = await receiver.ingest(envelope)
    const sessionId = arrived.receivingSessionId as unknown as SessionId
    const flush = vi.spyOn(ctx.sessions, 'flush')
    flush.mockRejectedValueOnce(new Error('injected loader flush failure'))
    await receiver.settle(envelope.operation.questionId, {
      kind: 'declined',
      settledByInstallationId: 'installation-local' as never,
      settledByDeviceName: 'Local Mac',
      settledAt: 1_100,
    })
    await vi.waitFor(() => { expect(flush.mock.calls.length).toBeGreaterThanOrEqual(2) }, { timeout: 1_000 })
    expect(ctx.sessions.get(sessionId)?.snapshotEvents()
      .filter(event => event.type === 'member-question/settled')).toHaveLength(1)
    expect(adapter.requests).toEqual([])
  })

  it('admits one human turn through the receiver onto a real AgentLoop turn', async () => {
    const { ctx, adapter, workspacePath } = await boot()
    const workspace = await ctx.workspaceRegistry.create(workspacePath)
    const receiver = ctx.memberQuestionReceiver as FileMemberQuestionReceiver
    await receiver.bind(envelope.authority.accountId, envelope.operation.projectId, workspace.id)
    const arrived = await receiver.ingest(envelope)
    const snapshot = await receiver.snapshot()
    const pending = snapshot.pending[0]
    if (pending === undefined) throw new Error('expected a pending question')
    const sessionId = arrived.receivingSessionId as unknown as SessionId
    const idle = waitForIdle(ctx, sessionId)
    const rpcId = 'human-turn-loader'
    const admitted = await invokeAdmit(ctx, {
      receivingSessionId: arrived.receivingSessionId,
      revision: pending.revision,
      requestId: rpcId,
      content: [{ type: 'text', text: 'Use JSONL.' }],
      mode: 'queue',
    })
    expect(admitted).toMatchObject({ accepted: true, receivingSessionId: arrived.receivingSessionId, rpcId })
    await idle
    const events = ctx.sessions.get(sessionId)?.snapshotEvents() ?? []
    const human = events.filter(event => event.type === 'user/message'
      && event.data.id === `member-question-human:${rpcId}`)
    expect(human).toHaveLength(1)
    expect(human[0]?.data.source).toMatchObject({ kind: 'user', rpcId })
    expect(events.some(event => event.type === 'turn/start')).toBe(true)
    expect(adapter.requests).toHaveLength(1)
    const replayed = await invokeAdmit(ctx, {
      receivingSessionId: arrived.receivingSessionId,
      revision: pending.revision,
      requestId: rpcId,
      content: [{ type: 'text', text: 'Use JSONL.' }],
      mode: 'queue',
    })
    expect(replayed.rpcId).toBe(rpcId)
    expect(ctx.sessions.get(sessionId)?.snapshotEvents()
      .filter(event => event.type === 'user/message'
        && event.data.id === `member-question-human:${rpcId}`)).toHaveLength(1)
    expect(adapter.requests).toHaveLength(1)
  })

  it('refuses a human turn for an unmaterialized receiving identity', async () => {
    const { ctx, workspacePath } = await boot()
    const workspace = await ctx.workspaceRegistry.create(workspacePath)
    const receiver = ctx.memberQuestionReceiver as FileMemberQuestionReceiver
    await receiver.bind(envelope.authority.accountId, envelope.operation.projectId, workspace.id)
    await expect(invokeAdmit(ctx, {
      receivingSessionId: 'receiving-missing',
      revision: 1,
      requestId: 'human-turn-missing',
      content: [{ type: 'text', text: 'hello' }],
      mode: 'queue',
    })).rejects.toMatchObject({
      code: 'member-question/human-turn-failed',
      message: expect.stringContaining('unknown receiving Session'),
    })
  })

  it('promotes an encoded image through generated admitHumanTurn without storing raw bytes in the ledger', async () => {
    const { ctx, adapter, workspacePath } = await boot()
    const workspace = await ctx.workspaceRegistry.create(workspacePath)
    const receiver = ctx.memberQuestionReceiver as FileMemberQuestionReceiver
    await receiver.bind(envelope.authority.accountId, envelope.operation.projectId, workspace.id)
    const arrived = await receiver.ingest(envelope)
    const pending = (await receiver.snapshot()).pending[0]
    if (pending === undefined) throw new Error('expected a pending question')
    const sessionId = arrived.receivingSessionId as unknown as SessionId
    const rpcId = 'human-turn-image'
    const idle = waitForIdle(ctx, sessionId)
    await invokeAdmit(ctx, {
      receivingSessionId: arrived.receivingSessionId,
      revision: pending.revision,
      requestId: rpcId,
      content: [
        { type: 'text', text: 'See this decision.' },
        { type: 'image', mediaType: 'image/png', data: PNG_1X1, name: 'decision.png' },
      ],
      mode: 'queue',
    })
    await expect.poll(() => {
      const events = ctx.sessions.get(sessionId)?.snapshotEvents() ?? []
      return events.some(event => event.type === 'user/message'
        && event.data.id === `member-question-human:${rpcId}`
        && event.data.content.some(block => block.type === 'image' && 'attachment' in block))
    }).toBe(true)
    const events = ctx.sessions.get(sessionId)?.snapshotEvents() ?? []
    const human = events.find(event => event.type === 'user/message'
      && event.data.id === `member-question-human:${rpcId}`)
    expect(JSON.stringify(human?.data.content)).not.toContain(PNG_1X1)
    await idle
    expect(adapter.requests).toHaveLength(1)
  })

  it('runs ingest, human turn, model response, and terminal settle on one Loader-owned Host', async () => {
    const { ctx, adapter, workspacePath, jsonlRoot } = await boot()
    const workspace = await ctx.workspaceRegistry.create(workspacePath)
    const receiver = ctx.memberQuestionReceiver as FileMemberQuestionReceiver
    await receiver.bind(envelope.authority.accountId, envelope.operation.projectId, workspace.id)
    const arrived = await receiver.ingest(envelope)
    const pending = (await receiver.snapshot()).pending[0]
    if (pending === undefined) throw new Error('expected a pending question')
    const sessionId = arrived.receivingSessionId as unknown as SessionId
    expect(ctx.sessions.get(sessionId)?.snapshotEvents()
      .some(event => event.type === 'turn/start')).toBe(false)
    expect(adapter.requests).toEqual([])
    const idle = waitForIdle(ctx, sessionId)
    const rpcId = 'human-turn-owned'
    await invokeAdmit(ctx, {
      receivingSessionId: arrived.receivingSessionId,
      revision: pending.revision,
      requestId: rpcId,
      content: [{ type: 'text', text: 'Use JSONL.' }],
      mode: 'queue',
    })
    await idle
    const liveEvents = ctx.sessions.get(sessionId)?.snapshotEvents() ?? []
    expect(liveEvents.some(event => event.type === 'user/message'
      && event.data.id === `member-question-human:${rpcId}`)).toBe(true)
    expect(liveEvents.some(event => event.type === 'assistant/message'
      && JSON.stringify(event.data).includes('acknowledged the brief'))).toBe(true)
    expect(adapter.requests).toHaveLength(1)
    await receiver.settle(envelope.operation.questionId, {
      kind: 'declined',
      settledByInstallationId: 'installation-local' as never,
      settledByDeviceName: 'Local Mac',
      settledAt: Date.now(),
    })
    await vi.waitFor(() => {
      expect(ctx.sessions.get(sessionId)?.snapshotEvents()
        .filter(event => event.type === 'member-question/settled')).toHaveLength(1)
    })
    const reader = new Context()
    contexts.push(reader)
    await reader.plugin(SessionStore)
    await reader.plugin(JsonlSessionPersistence, { root: jsonlRoot, compression: 'none' })
    const stored = await reader.sessionPersistence.open(sessionId, 'read')
    try {
      const persisted = await stored.read()
      expect(persisted.filter(event => event.type === 'member-question/received')).toHaveLength(1)
      expect(persisted.filter(event => event.type === 'user/message'
        && event.data.id === `member-question-human:${rpcId}`)).toHaveLength(1)
      expect(persisted.filter(event => event.type === 'member-question/settled')).toHaveLength(1)
    } finally {
      await stored.close()
    }
  })

  it('withdraws the unique Host admitter when the Session Controller Loader entry unloads', async () => {
    const { ctx, workspacePath } = await boot()
    const workspace = await ctx.workspaceRegistry.create(workspacePath)
    const receiver = ctx.memberQuestionReceiver as FileMemberQuestionReceiver
    await receiver.bind(envelope.authority.accountId, envelope.operation.projectId, workspace.id)
    expect(() => ctx.memberQuestionReceiver.registerHumanTurnAdmitter(async () => ({ accepted: true as const })))
      .toThrow('already registered')
    expect(() => ctx.memberQuestionReceiver.registerSessionMaterializer(async () => ({ accepted: true as const })))
      .toThrow('already registered')
    const controller = [...ctx.loader.entries()]
      .find(entry => entry.options.name === '@deepseek-ai/dsh-api-session-controller')
    if (controller?.fiber === undefined) throw new Error('expected Session Controller Loader fiber')
    await controller.fiber.dispose()
    const replacementAdmitter = ctx.memberQuestionReceiver.registerHumanTurnAdmitter(async () => ({ accepted: true as const }))
    replacementAdmitter()
    const replacementMaterializer = ctx.memberQuestionReceiver.registerSessionMaterializer(async () => ({ accepted: true as const }))
    replacementMaterializer()
  })
})
