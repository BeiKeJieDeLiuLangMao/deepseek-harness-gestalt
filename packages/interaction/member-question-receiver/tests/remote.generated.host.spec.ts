import { mkdirSync, writeFileSync } from 'node:fs'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'
import { Context } from '@deepseek-ai/cordis'
import type { PlatformAccountId } from '@deepseek-ai/dsh-platform-account'
import {
  parseCompanionOperationId,
  parseCompanionSessionId,
  parseMemberQuestionId,
  parseMemberQuestionProjectId,
} from '@deepseek-ai/dsh-remote-protocol'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import { apply as applyClientRemote, inject as clientRemoteInject } from '@deepseek-ai/dsh-api-gateway/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import FileMemberQuestionReceiver, {
  memberQuestionRemoteSettleRequestSchema,
} from '../src/index.ts'
import type {
  MemberQuestionReceiverConfig,
  MemberQuestionTerminalAuthority,
  MemberQuestionTerminalClaim,
} from '../src/index.ts'

const roots: string[] = []
const contexts: Context[] = []
const hostArtifact = new URL('../lib/typert.host.js', import.meta.url)
const remoteArtifact = new URL('../lib/typert.remote-client.js', import.meta.url)
const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url))

beforeAll(() => {
  const artifacts = new WorkspaceTypertGenerator(workspaceRoot)
    .generate(['@deepseek-ai/dsh-member-question-receiver'], ['host'])
  for (const artifact of artifacts) {
    const output = join(workspaceRoot, artifact.packageRoot, 'lib')
    mkdirSync(output, { recursive: true })
    writeFileSync(join(output, `typert.${artifact.face}.js`), artifact.js)
    writeFileSync(join(output, `typert.${artifact.face}.d.ts`), artifact.dts)
    if (artifact.remote === undefined) {
      throw new Error('member-question-receiver Host face emitted no Remote client artifact')
    }
    writeFileSync(join(output, 'typert.remote-client.js'), artifact.remote.js)
    writeFileSync(join(output, 'typert.remote-client.d.ts'), artifact.remote.dts)
    writeFileSync(join(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
  }
}, 120_000)

afterEach(async () => {
  for (const context of contexts.splice(0).reverse()) await context.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

const envelope = {
  authority: { accountId: 'account-receiver' as PlatformAccountId },
  operation: {
    type: 'member-question' as const,
    operationId: parseCompanionOperationId('operation-generated-1'),
    questionId: parseMemberQuestionId('question-generated-1'),
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

async function requireGeneratedArtifacts(): Promise<{
  readonly TYPERT: TypertContribution
  readonly TYPERT_REMOTE: TypertRemoteContribution
}> {
  await access(hostArtifact)
  await access(remoteArtifact)
  const host = await import(pathToFileURL(hostArtifact.pathname).href) as { TYPERT: TypertContribution }
  const remote = await import(pathToFileURL(remoteArtifact.pathname).href) as {
    default: TypertRemoteContribution
    TYPERT_REMOTE: TypertRemoteContribution
  }
  return { TYPERT: host.TYPERT, TYPERT_REMOTE: remote.TYPERT_REMOTE ?? remote.default }
}

async function createGeneratedHost(overrides: Partial<MemberQuestionReceiverConfig> = {}): Promise<{
  readonly ctx: Context
  readonly receiver: FileMemberQuestionReceiver
}> {
  const storagePath = await mkdtemp(join(tmpdir(), 'dsh-member-question-generated-'))
  roots.push(storagePath)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(TypertRegistry)
  const { TYPERT } = await requireGeneratedArtifacts()
  ctx.typert.register(TYPERT)
  await ctx.plugin(TypertGatewayService)
  await ctx.plugin(FileMemberQuestionReceiver, {
    storagePath,
    environment: 'development',
    maxRecords: 16,
    terminalRetryMs: 10,
    clock: () => 1_000,
    terminalAuthority: new MemoryTerminalAuthority(),
    memberQuestionInstallationId: 'installation-host',
    memberQuestionDeviceName: 'Host Mac',
    ...overrides,
  })
  return { ctx, receiver: ctx.memberQuestionReceiver as FileMemberQuestionReceiver }
}

describe('generated member-question Remote codecs', () => {
  it('registers the generated Host descriptor and rejects extra identity on settle', async () => {
    const { ctx, receiver } = await createGeneratedHost()
    const arrived = await receiver.ingest(envelope)
    const snapshot = await ctx.typertGateway.invoke({
      namespace: 'memberQuestion',
      method: 'snapshot',
      args: {},
    }) as { pending: readonly { questionId: string }[] }
    expect(snapshot.pending[0]?.questionId).toBe(arrived.questionId)
    expect(memberQuestionRemoteSettleRequestSchema.safeParse({
      receivingSessionId: arrived.receivingSessionId,
      revision: arrived.revision,
      questionId: arrived.questionId,
      response: { kind: 'declined' },
      settledByInstallationId: 'forged-installation',
      settledAt: 9_999,
    }).success).toBe(false)

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
    }) as { outcome: string; settledByInstallationId: string; settledAt: number }
    expect(terminal).toMatchObject({
      outcome: 'answered',
      settledByInstallationId: 'installation-host',
      settledAt: 1_000,
    })
  })

  it('rejects a stale revision through the generated Host codec', async () => {
    const { ctx, receiver } = await createGeneratedHost()
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
    })).rejects.toMatchObject({ code: 'member-question/revision-stale' })
  })

  it('mounts the generated Client remote and codec-rejects extra identity fields', async () => {
    const { TYPERT_REMOTE } = await requireGeneratedArtifacts()
    const calls: unknown[] = []
    const host = await createGeneratedHost()
    const arrived = await host.receiver.ingest(envelope)
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(TypertRegistry)
    ctx.provide('connection', {
      registerGenerationSource: () => () => {},
      start: () => ({ stop() {} }),
      rpc: {
        call: async (_channel: string, endpoint: string, payload: unknown) => {
          calls.push({ endpoint, payload })
          const args = (payload as { args: Record<string, unknown> }).args
          try {
            const value = await host.ctx.typertGateway.invoke({
              namespace: endpoint.split('/')[0] as string,
              method: endpoint.split('/')[1] as string,
              args,
            })
            return { ok: true, value }
          } catch (error) {
            const failure = error as { code?: string; message?: string; details?: object }
            return {
              ok: false,
              error: {
                code: failure.code ?? 'gateway/internal',
                message: failure.message ?? String(error),
                details: failure.details ?? {},
              },
            }
          }
        },
      },
    } as unknown as ConnectionHandle)
    const client = ctx.plugin({ inject: [...clientRemoteInject], apply: applyClientRemote })
    await client
    const dispose = await ctx.remote.$mount(TYPERT_REMOTE)
    const settleCodec = TYPERT_REMOTE.descriptors.find(descriptor => descriptor.method === 'settle')
      ?.parameters[0]?.codec.schema
    expect(settleCodec).toBeDefined()
    expect(memberQuestionRemoteSettleRequestSchema.safeParse({
      receivingSessionId: arrived.receivingSessionId,
      revision: arrived.revision,
      questionId: arrived.questionId,
      response: { kind: 'declined' },
      settledByInstallationId: 'forged-installation',
      settledAt: 9_999,
    }).success).toBe(false)
    await expect(ctx.remote.memberQuestion.settle({
      receivingSessionId: arrived.receivingSessionId,
      revision: arrived.revision,
      questionId: arrived.questionId,
      response: { kind: 'declined' },
      settledByInstallationId: 'forged-installation',
      settledAt: 9_999,
    })).resolves.toMatchObject({
      ok: true,
      value: { outcome: 'declined', settledByInstallationId: 'installation-host', settledAt: 1_000 },
    })
    const settleCall = calls.find(call => (call as { endpoint: string }).endpoint === 'memberQuestion/settle') as {
      payload: { args: { request: Record<string, unknown> } }
    }
    expect(settleCall.payload.args.request.settledByInstallationId).toBeUndefined()
    expect(settleCall.payload.args.request.settledAt).toBeUndefined()
    await expect(ctx.remote.memberQuestion.snapshot()).resolves.toMatchObject({
      ok: true,
      value: { pending: [] },
    })
    await dispose()
    expect((ctx.remote as { memberQuestion?: unknown }).memberQuestion).toBeUndefined()
  })
})
