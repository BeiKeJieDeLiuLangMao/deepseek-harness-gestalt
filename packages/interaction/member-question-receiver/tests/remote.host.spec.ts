import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { PlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import {
  parseCompanionOperationId,
  parseCompanionSessionId,
  parseMemberQuestionId,
  parseMemberQuestionProjectId,
} from '@deepseek-ai/dsh-remote-protocol'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import { RemoteError, remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import FileMemberQuestionReceiver from '../src/index.ts'
import type {
  MemberQuestionReceiverConfig,
  MemberQuestionTerminalAuthority,
  MemberQuestionTerminalClaim,
} from '../src/index.ts'

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
    operationId: parseCompanionOperationId('operation-remote-1'),
    questionId: parseMemberQuestionId('question-remote-1'),
    projectId: parseMemberQuestionProjectId('project-1'),
    originSessionId: parseCompanionSessionId('origin-session-1'),
    expiresAt: 2_000,
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

async function createHost(overrides: Partial<MemberQuestionReceiverConfig> = {}): Promise<{
  readonly ctx: Context
  readonly receiver: FileMemberQuestionReceiver
  readonly authority: MemoryTerminalAuthority
}> {
  const storagePath = await mkdtemp(join(tmpdir(), 'dsh-member-question-remote-'))
  roots.push(storagePath)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(TypertGatewayService)
  const authority = overrides.terminalAuthority instanceof MemoryTerminalAuthority
    ? overrides.terminalAuthority
    : new MemoryTerminalAuthority()
  await ctx.plugin(FileMemberQuestionReceiver, {
    storagePath,
    environment: 'development',
    maxRecords: 16,
    terminalRetryMs: 10,
    clock: () => 1_000,
    terminalAuthority: authority,
    memberQuestionInstallationId: 'installation-host',
    memberQuestionDeviceName: 'Host Mac',
    ...overrides,
  })
  return {
    ctx,
    receiver: ctx.memberQuestionReceiver as FileMemberQuestionReceiver,
    authority,
  }
}

describe('member-question Remote snapshot and settle', () => {
  it('publishes the memberQuestion namespace and Remote method names', async () => {
    const { receiver } = await createHost()
    expect(receiver.typertRemote.serviceKey).toBe('memberQuestionReceiver')
    expect(receiver.typertRemote.namespace).toBe('memberQuestion')
    expect(remoteMethods(receiver)).toEqual([
      { method: 'remoteSnapshot', exportName: 'snapshot', invocation: { kind: 'direct' } },
      { method: 'remoteSettle', exportName: 'settle', invocation: { kind: 'direct' } },
    ])
  })

  it('snapshots through Gateway SRC and settles from Host identity and clock', async () => {
    const { ctx, receiver } = await createHost()
    const arrived = await receiver.ingest(envelope)
    const snapshot = await ctx.typertGateway.invoke({
      namespace: 'memberQuestion',
      method: 'snapshot',
      args: {},
    }) as Awaited<ReturnType<FileMemberQuestionReceiver['snapshot']>>
    expect(snapshot.pending).toHaveLength(1)
    expect(snapshot.pending[0]?.questionId).toBe(arrived.questionId)
    expect(snapshot.pending[0]?.receivingSessionId).toBe(arrived.receivingSessionId)

    const terminal = await ctx.typertGateway.invoke({
      namespace: 'memberQuestion',
      method: 'settle',
      args: {
        request: {
          receivingSessionId: arrived.receivingSessionId,
          revision: arrived.revision,
          questionId: arrived.questionId,
          response: { kind: 'answered', answers: [{ id: 'choice', selected: ['Continue'] }] },
        },
      },
    }) as { outcome: string; settledByInstallationId: string; settledByDeviceName: string; settledAt: number }
    expect(terminal).toMatchObject({
      outcome: 'answered',
      settledByInstallationId: 'installation-host',
      settledByDeviceName: 'Host Mac',
      settledAt: 1_000,
    })
    const after = await receiver.snapshot()
    expect(after.pending).toEqual([])
    expect(after.terminal[0]?.terminal).toMatchObject({
      outcome: 'answered',
      settledByInstallationId: 'installation-host',
    })
  })

  it('rejects a stale revision without calling settle', async () => {
    const { ctx, receiver } = await createHost()
    const arrived = await receiver.ingest(envelope)
    await expect(ctx.typertGateway.invoke({
      namespace: 'memberQuestion',
      method: 'settle',
      args: {
        request: {
          receivingSessionId: arrived.receivingSessionId,
          revision: arrived.revision + 1,
          questionId: arrived.questionId,
          response: { kind: 'declined' },
        },
      },
    })).rejects.toMatchObject({
      code: 'member-question/revision-stale',
      details: {
        receivingSessionId: arrived.receivingSessionId,
        questionId: arrived.questionId,
        revision: arrived.revision + 1,
      },
    })
    expect((await receiver.snapshot()).pending).toHaveLength(1)
  })

  it('rejects a forged receiving Session or question id as stale', async () => {
    const { ctx, receiver } = await createHost()
    const arrived = await receiver.ingest(envelope)
    await expect(ctx.typertGateway.invoke({
      namespace: 'memberQuestion',
      method: 'settle',
      args: {
        request: {
          receivingSessionId: 'forged-session',
          revision: arrived.revision,
          questionId: arrived.questionId,
          response: { kind: 'declined' },
        },
      },
    })).rejects.toBeInstanceOf(RemoteError)
    await expect(ctx.typertGateway.invoke({
      namespace: 'memberQuestion',
      method: 'settle',
      args: {
        request: {
          receivingSessionId: arrived.receivingSessionId,
          revision: arrived.revision,
          questionId: 'forged-question',
          response: { kind: 'declined' },
        },
      },
    })).rejects.toMatchObject({ code: 'member-question/revision-stale' })
    expect((await receiver.snapshot()).pending).toHaveLength(1)
  })

  it('rejects Installation identity and settledAt on the SRC wire', async () => {
    const { ctx, receiver } = await createHost({ clock: () => 1_500 })
    const arrived = await receiver.ingest(envelope)
    await expect(ctx.typertGateway.invoke({
      namespace: 'memberQuestion',
      method: 'settle',
      args: {
        request: {
          receivingSessionId: arrived.receivingSessionId,
          revision: arrived.revision,
          questionId: arrived.questionId,
          response: { kind: 'declined' },
          settledByInstallationId: 'forged-installation',
          settledByDeviceName: 'Forged Phone',
          settledAt: 9_999,
        },
      },
    })).rejects.toMatchObject({ code: 'gateway/bad-request' })
    expect((await receiver.snapshot()).pending).toHaveLength(1)
  })

  it('fails closed when Host settlement identity is uncomposed', async () => {
    const { ctx, receiver } = await createHost({
      memberQuestionInstallationId: undefined,
      memberQuestionDeviceName: undefined,
    })
    const arrived = await receiver.ingest(envelope)
    await expect(ctx.typertGateway.invoke({
      namespace: 'memberQuestion',
      method: 'settle',
      args: {
        request: {
          receivingSessionId: arrived.receivingSessionId,
          revision: arrived.revision,
          questionId: arrived.questionId,
          response: { kind: 'declined' },
        },
      },
    })).rejects.toMatchObject({ code: 'member-question/settlement-identity-unavailable' })
    expect((await receiver.snapshot()).pending).toHaveLength(1)
  })

  it('replays an already settled question through the receiver store', async () => {
    const { ctx, receiver } = await createHost()
    const arrived = await receiver.ingest(envelope)
    const first = await ctx.typertGateway.invoke({
      namespace: 'memberQuestion',
      method: 'settle',
      args: {
        request: {
          receivingSessionId: arrived.receivingSessionId,
          revision: arrived.revision,
          questionId: arrived.questionId,
          response: { kind: 'answered', answers: [{ id: 'choice', selected: ['Continue'] }] },
        },
      },
    })
    const after = await receiver.snapshot()
    await expect(receiver.settle(arrived.questionId, {
      kind: 'declined',
      settledByInstallationId: 'installation-other' as never,
      settledByDeviceName: 'Other',
      settledAt: 9_000,
    })).resolves.toEqual(first)
    expect((await receiver.snapshot()).revision).toBe(after.revision)
  })

  it('stops publishing snapshot changes after the listener is unregistered', async () => {
    const { receiver } = await createHost()
    const revisions: number[] = []
    const unsubscribe = receiver.changes((snapshot) => {
      revisions.push(snapshot.revision)
    })
    const arrived = await receiver.ingest(envelope)
    expect(revisions).toEqual([arrived.revision])
    unsubscribe()
    await receiver.settle(arrived.questionId, {
      kind: 'declined',
      settledByInstallationId: 'installation-host' as never,
      settledByDeviceName: 'Host Mac',
      settledAt: 1_100,
    })
    expect(revisions).toEqual([arrived.revision])
  })
})
