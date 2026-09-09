/** Generated Session Remote codecs for attachment admission and queue editing. */

import { mkdirSync, writeFileSync } from 'node:fs'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle, CreateAgentOptions, Inbox } from '@deepseek-ai/dsh-agent'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import { apply as applyClientRemote, inject as clientRemoteInject } from '@deepseek-ai/dsh-api-gateway/client'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import type {} from '@deepseek-ai/dsh-api-session-controller/remote'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import SessionController from '../src/index.ts'
import { installSessionReadTestServices } from './test-remote.ts'

const sid = (id: string): SessionId => id as SessionId
const roots: string[] = []
const contexts: Context[] = []
const hostArtifact = new URL('../lib/typert.host.js', import.meta.url)
const remoteArtifact = new URL('../lib/typert.remote-client.js', import.meta.url)
const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url))

beforeAll(() => {
  const artifacts = new WorkspaceTypertGenerator(workspaceRoot)
    .generate(['@deepseek-ai/dsh-api-session-controller'], ['host'])
  for (const artifact of artifacts) {
    const output = join(workspaceRoot, artifact.packageRoot, 'lib')
    mkdirSync(output, { recursive: true })
    writeFileSync(join(output, `typert.${artifact.face}.js`), artifact.js)
    writeFileSync(join(output, `typert.${artifact.face}.d.ts`), artifact.dts)
    if (artifact.remote === undefined) {
      throw new Error('session-controller Host face emitted no Remote client artifact')
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

function pdfPayload(extras: {
  readonly sessionId?: SessionId
  readonly operationId?: string
  readonly mediaType?: string
  readonly name?: string
  readonly data?: string
} = {}) {
  const data = extras.data ?? Buffer.from('%PDF-1.4 generated', 'utf8').toString('base64')
  return {
    sessionId: extras.sessionId ?? sid('admit-generated'),
    operationId: extras.operationId ?? 'op-generated',
    mediaType: extras.mediaType ?? 'application/pdf',
    name: extras.name ?? 'notes.pdf',
    data,
  }
}

function imageRef(id: string): ImageAttachmentRef {
  return {
    attachmentId: AttachmentId(id),
    mediaType: 'image/png',
    bytes: 1,
    width: 1,
    height: 1,
    name: 'authorized.png',
  }
}

async function createGeneratedHost(origin?: 'subagent'): Promise<{
  readonly ctx: Context
  readonly sessionId: SessionId
  readonly inbox: Inbox
}> {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-admit-generated-'))
  roots.push(dshHome)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(TypertRegistry)
  const { TYPERT } = await requireGeneratedArtifacts()
  ctx.typert.register(TYPERT)
  await ctx.plugin(TypertGatewayService)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LocalAttachmentStore, { dshHome, maxByteBytes: 1024 })
  await ctx.plugin(JsonlSessionPersistence, { root: join(dshHome, 'sessions'), compression: 'none' })
  installSessionReadTestServices(ctx)
  ctx.provide('workspaceRegistry', { list: () => [] } as never)
  ctx.provide('fileUploads', { registerAgentResolver: () => () => {} } as never)
  ctx.provide('fileReferences', {
    list: () => Promise.resolve([]),
  } as never)
  ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'fixture', model: 'fixture-model' }),
    saveSelection: () => Promise.resolve(),
  } as never)
  ctx.provide('llm', {
    listProviders: () => [{ id: 'fixture', name: 'fixture' }],
  } as never)
  ctx.agents.setFactory({
    createAgent: async (ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle> => {
      const session = ctx.sessions.create(options.sessionId, {
        ...options.seed === undefined ? {} : { seed: [...options.seed] },
        ...options.meta === undefined ? {} : { meta: options.meta },
      })
      const handle = await ctx.sessionPersistence.create(session.header)
      const agent = {} as Agent
      const agentCtx = ownerCtx.extend({ agent })
      Object.assign(agent, { id: session.id, session, status: 'idle', ctx: agentCtx })
      await options.setup?.(agentCtx, agent)
      ctx.agents.register(agent)
      return { agent, dispose: async () => { await handle.close() } }
    },
    resume: () => Promise.reject(new Error('generated admit tests keep sources live')),
  })
  const session = ctx.sessions.create(sid('admit-generated'), {
    meta: { cwd: '/proj', ...origin === undefined ? {} : { origin, parentSession: sid('parent') } },
  })
  const liveHandle = await ctx.sessionPersistence.create(session.header)
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'context' }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  ctx.effect(() => () => { void liveHandle.close() })
  const inbox = createInboxStub()
  ctx.agents.register({ id: session.id, session, status: 'idle', ctx, inbox } as Agent)
  await ctx.plugin(SessionController, { nativeOpen: false })
  return { ctx, sessionId: session.id, inbox }
}

describe('generated Session Remote codecs', () => {
  it('analyzes the Host face without an illegal receiving-materializer effect', () => {
    expect(() => new WorkspaceTypertGenerator(workspaceRoot)
      .generate(['@deepseek-ai/dsh-api-session-controller'], ['host'])).not.toThrow()
  })

  it('activates SessionController when memberQuestionReceiver is uncomposed', async () => {
    const { ctx } = await createGeneratedHost()
    expect(ctx.get('memberQuestionReceiver')).toBeUndefined()
    expect(ctx.sessionController.typertRemote.namespace).toBe('session')
  })

  it('admits a bounded Companion file through the generated Host codec', async () => {
    const { ctx } = await createGeneratedHost()
    const value = await ctx.typertGateway.invoke({
      namespace: 'session',
      method: 'admitAttachment',
      args: { request: pdfPayload() },
    }) as { attachment: { name?: string; mediaType: string } }
    expect(value.attachment).toMatchObject({ name: 'notes.pdf', mediaType: 'application/pdf' })
  })

  it('rejects unbounded and malformed payloads before saveBytes', async () => {
    const { ctx } = await createGeneratedHost()
    await expect(ctx.typertGateway.invoke({
      namespace: 'session',
      method: 'admitAttachment',
      args: { request: pdfPayload({ name: '' }) },
    })).rejects.toMatchObject({ code: 'session/attachment-invalid' })
    await expect(ctx.typertGateway.invoke({
      namespace: 'session',
      method: 'admitAttachment',
      args: { request: pdfPayload({ data: '@@@' }) },
    })).rejects.toMatchObject({ code: 'session/attachment-invalid' })
  })

  it('refuses subagent-owned Sessions', async () => {
    const { ctx } = await createGeneratedHost('subagent')
    await expect(ctx.typertGateway.invoke({
      namespace: 'session',
      method: 'admitAttachment',
      args: { request: pdfPayload() },
    })).rejects.toMatchObject({ code: 'session/agent-busy' })
  })

  it('mounts the generated Client remote and enforces attachment and queue-edit codecs', async () => {
    const { TYPERT_REMOTE } = await requireGeneratedArtifacts()
    const host = await createGeneratedHost()
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(TypertRegistry)
    ctx.provide('connection', {
      registerGenerationSource: () => () => {},
      start: () => ({ stop() {} }),
      rpc: {
        call: async (_channel: string, endpoint: string, payload: unknown) => {
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
    await ctx.plugin({ inject: [...clientRemoteInject], apply: applyClientRemote })
    const dispose = await ctx.remote.$mount(TYPERT_REMOTE)
    await expect(ctx.remote.session.admitAttachment(pdfPayload({ name: '' }))).resolves.toMatchObject({
      ok: false,
      error: { code: 'session/attachment-invalid' },
    })
    await expect(ctx.remote.session.admitAttachment(pdfPayload())).resolves.toMatchObject({
      ok: true,
      value: { attachment: { name: 'notes.pdf' } },
    })

    const attachment = imageRef('generated-queue-image')
    const queued = createUserMessage({
      content: [
        { type: 'text', text: 'before' },
        { type: 'image', attachment },
      ],
      source: { kind: 'user' },
    })
    host.inbox.append('next-turn', queued)
    const callerRef: ImageAttachmentRef = {
      ...attachment,
      mediaType: 'image/jpeg',
      bytes: 200,
      width: 20,
      height: 10,
      name: 'caller.jpg',
    }
    await expect(ctx.remote.session.updateQueue({
      sessionId: host.sessionId,
      itemId: queued.id,
      action: {
        kind: 'edit',
        content: [
          { type: 'text', text: 'after' },
          { type: 'image', attachment: callerRef },
        ],
      },
    })).resolves.toEqual({ ok: true, value: { accepted: true } })
    expect(host.inbox.nextTurn[0]?.content).toEqual([
      { type: 'text', text: 'after' },
      { type: 'image', attachment },
    ])

    await expect(ctx.remote.session.updateQueue({
      sessionId: host.sessionId,
      itemId: queued.id,
      action: {
        kind: 'edit',
        content: [{ type: 'image', attachment: imageRef('foreign-generated-image') }],
      },
    })).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'session/attachment-invalid',
        details: { reason: 'QUEUE_EDIT_ATTACHMENT_NOT_REFERENCED' },
      },
    })
    expect(host.inbox.nextTurn[0]?.content).toEqual([
      { type: 'text', text: 'after' },
      { type: 'image', attachment },
    ])

    await expect(ctx.remote.session.updateQueue({
      sessionId: host.sessionId,
      itemId: queued.id,
      action: {
        kind: 'edit',
        content: [{ type: 'text', text: 'drops image' }],
      },
    })).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'session/attachment-invalid',
        details: { reason: 'QUEUE_EDIT_ATTACHMENT_OMITTED' },
      },
    })
    expect(host.inbox.nextTurn[0]?.content).toEqual([
      { type: 'text', text: 'after' },
      { type: 'image', attachment },
    ])

    await expect(ctx.remote.session.updateQueue({
      sessionId: host.sessionId,
      itemId: queued.id,
      action: {
        kind: 'edit',
        content: [
          { type: 'image', attachment: callerRef },
          { type: 'image', attachment: callerRef },
        ],
      },
    })).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'session/attachment-invalid',
        details: { reason: 'QUEUE_EDIT_ATTACHMENT_MULTIPLICITY' },
      },
    })
    expect(host.inbox.nextTurn[0]?.content).toEqual([
      { type: 'text', text: 'after' },
      { type: 'image', attachment },
    ])

    const rawImageEdit = {
      sessionId: host.sessionId,
      itemId: queued.id,
      action: {
        kind: 'edit',
        content: [{ type: 'image', mediaType: 'image/png', data: 'AAAA' }],
      },
    }
    await expect(Promise.resolve().then(() => ctx.remote.session.updateQueue(rawImageEdit as never)))
      .rejects.toThrow('client api: session/updateQueue rejected "request"')
    await expect(host.ctx.typertGateway.invoke({
      namespace: 'session',
      method: 'updateQueue',
      args: { request: rawImageEdit },
    })).rejects.toMatchObject({ code: 'gateway/input-invalid' })
    expect(host.inbox.nextTurn[0]?.content).toEqual([
      { type: 'text', text: 'after' },
      { type: 'image', attachment },
    ])
    await dispose()
  })
})
