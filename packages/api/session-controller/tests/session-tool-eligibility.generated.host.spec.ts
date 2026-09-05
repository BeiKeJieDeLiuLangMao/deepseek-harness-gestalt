/** Generated Session Remote codecs for session.toolEligibility. */

import { mkdirSync, writeFileSync } from 'node:fs'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle, CreateAgentOptions } from '@deepseek-ai/dsh-agent'
import { apply as applyClientRemote, inject as clientRemoteInject } from '@deepseek-ai/dsh-api-gateway/client'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
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
  const artifacts = new WorkspaceTypertGenerator(workspaceRoot, { checkDiagnostics: true })
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

function tool(name: string, deferLoading = false): ToolDefinition {
  return {
    name,
    description: `tool ${name}`,
    parameters: { type: 'object', properties: {} },
    deferLoading,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value as string }],
    },
    execute: () => Promise.resolve(name),
  }
}

const READ_SCHEMA = {
  name: 'read',
  description: 'tool read',
  parameters: { type: 'object', properties: {} },
}
const WRITE_SCHEMA = {
  name: 'write',
  description: 'tool write',
  parameters: { type: 'object', properties: {} },
}

type AllowPolicy = readonly string[] | undefined

interface GeneratedHost {
  readonly ctx: Context
  readonly sessionId: SessionId
}

async function createGeneratedHost(options: {
  readonly origin?: 'subagent'
  readonly tools?: boolean
  readonly allow?: AllowPolicy
  readonly live?: boolean
} = {}): Promise<GeneratedHost> {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-eligibility-generated-'))
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
  await ctx.plugin(SystemPrompt, {})
  if (options.tools !== false) {
    await ctx.plugin(ToolRuntime, { toolSearch: { maxResultBytes: 65_536 } })
    ctx.tools.register(tool('read', true))
    ctx.tools.register(tool('write'))
  }
  await ctx.plugin(LocalAttachmentStore, { dshHome, maxByteBytes: 1024 })
  await ctx.plugin(JsonlSessionPersistence, { root: join(dshHome, 'sessions'), compression: 'none' })
  installSessionReadTestServices(ctx)
  ctx.provide('workspaceRegistry', { list: () => [] } as never)
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

  const mintAgent = async (
    ownerCtx: Context,
    agent: Agent,
    setup: CreateAgentOptions['setup'],
  ): Promise<Context> => {
    const withAgent = ownerCtx.extend({ agent })
    Object.assign(agent, { status: 'idle', ctx: withAgent })
    await setup?.(withAgent)
    let agentCtx = withAgent
    if (options.allow !== undefined && options.tools !== false) {
      await withAgent.plugin(Object.assign((inner: Context) => {
        agentCtx = createScope(inner, agent).ctx
        const tools = agentCtx.get('tools')
        if (tools !== undefined) tools.allowEligible([...options.allow!])
      }, { inject: ['tools'] }))
    }
    return agentCtx
  }

  ctx.agents.setFactory({
    createAgent: async (ownerCtx: Context, create: CreateAgentOptions): Promise<AgentHandle> => {
      const session = ctx.sessions.create(create.sessionId, {
        ...create.seed === undefined ? {} : { seed: [...create.seed] },
        ...create.meta === undefined ? {} : { meta: create.meta },
      })
      const handle = await ctx.sessionPersistence.create(session.header)
      const agent = { id: session.id, session } as Agent
      const agentCtx = await mintAgent(ownerCtx, agent, create.setup)
      Object.assign(agent, { status: 'idle', ctx: agentCtx })
      ctx.agents.register(agent)
      return { agent, dispose: async () => { await handle.close() } }
    },
    resume: async (ownerCtx: Context, resume): Promise<AgentHandle> => {
      let session = ctx.sessions.get(resume.resumeSessionId)
      let handle
      if (session === undefined) {
        handle = await ctx.sessionPersistence.open(resume.resumeSessionId, 'write')
        const persisted = await handle.read()
        session = ctx.sessions.prepare(resume.resumeSessionId, {
          seed: persisted,
          meta: structuredClone(handle.header),
          inheritedEventCount: handle.inheritedEventCount,
          seedSource: 'persistence',
        })
        ctx.sessions.enter(session)
        ctx.sessions.announce(session)
      } else {
        handle = await ctx.sessionPersistence.open(session.id, 'write')
      }
      const agent = { id: session.id, session } as Agent
      const agentCtx = await mintAgent(ownerCtx, agent, resume.setup)
      Object.assign(agent, { status: 'idle', ctx: agentCtx })
      ctx.agents.register(agent)
      return { agent, dispose: async () => { await handle.close() } }
    },
  })

  const sessionId = sid('eligibility-generated')
  const session = ctx.sessions.prepare(sessionId, {
    meta: {
      cwd: '/proj',
      ...options.origin === undefined ? {} : { origin: options.origin, parentSession: sid('parent') },
    },
  })
  const detach = ctx.sessions.enter(session)
  ctx.sessions.announce(session)
  const liveHandle = await ctx.sessionPersistence.create(session.header)
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'context' }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  await liveHandle.flush()

  if (options.live !== false) {
    ctx.effect(() => () => { void liveHandle.close() })
    const agent = { id: session.id, session } as Agent
    let agentCtx: Context
    if (options.allow === undefined) {
      agentCtx = ctx
    } else {
      await ctx.plugin(Object.assign((inner: Context) => {
        agentCtx = createScope(inner, agent).ctx
        const tools = agentCtx.get('tools')
        if (tools !== undefined) tools.allowEligible([...options.allow!])
      }, { inject: options.tools === false ? [] : ['tools'] }))
    }
    Object.assign(agent, { status: 'idle', ctx: agentCtx! })
    ctx.agents.register(agent)
  } else {
    await liveHandle.close()
    detach()
  }

  await ctx.plugin(SessionController, { nativeOpen: false })
  return { ctx, sessionId }
}

async function invokeEligibility(ctx: Context, sessionId: SessionId): Promise<unknown> {
  return ctx.typertGateway.invoke({
    namespace: 'session',
    method: 'toolEligibility',
    args: { request: { sessionId } },
  })
}

async function mountGeneratedClient(host: GeneratedHost): Promise<Context> {
  const { TYPERT_REMOTE } = await requireGeneratedArtifacts()
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
  await ctx.remote.$mount(TYPERT_REMOTE)
  return ctx
}

describe('generated session.toolEligibility Remote codecs', () => {
  it('projects the resolver catalog through the generated Host codec', async () => {
    const { ctx, sessionId } = await createGeneratedHost({ allow: ['read'] })
    await expect(invokeEligibility(ctx, sessionId)).resolves.toEqual({
      allow: ['read'],
      tools: [READ_SCHEMA],
    })
  })

  it('resumes a cold ordinary Session and keeps the Agent-context allow union', async () => {
    const { ctx, sessionId } = await createGeneratedHost({ allow: ['read'], live: false })
    expect(ctx.agents.get(sessionId)).toBeUndefined()
    await expect(invokeEligibility(ctx, sessionId)).resolves.toEqual({
      allow: ['read'],
      tools: [READ_SCHEMA],
    })
    expect(ctx.agents.get(sessionId)?.id).toBe(sessionId)
  })

  it('omits allow when no allow-only policy is active', async () => {
    const { ctx, sessionId } = await createGeneratedHost()
    await expect(invokeEligibility(ctx, sessionId)).resolves.toEqual({
      tools: [READ_SCHEMA, WRITE_SCHEMA],
    })
  })

  it('keeps an empty allow list when the composition allows no end tool', async () => {
    const { ctx, sessionId } = await createGeneratedHost({ allow: [] })
    await expect(invokeEligibility(ctx, sessionId)).resolves.toEqual({
      allow: [],
      tools: [],
    })
  })

  it('fails when the Tools service is not mounted', async () => {
    const { ctx, sessionId } = await createGeneratedHost({ tools: false })
    await expect(invokeEligibility(ctx, sessionId)).rejects.toMatchObject({
      code: 'gateway/internal',
    })
  })

  it('refuses subagent-owned Sessions', async () => {
    const { ctx, sessionId } = await createGeneratedHost({ origin: 'subagent', allow: ['read'] })
    await expect(invokeEligibility(ctx, sessionId)).rejects.toMatchObject({
      code: 'session/agent-busy',
    })
  })

  it('mounts the generated Client remote and codec-rejects a missing sessionId', async () => {
    const host = await createGeneratedHost({ allow: ['read'] })
    const ctx = await mountGeneratedClient(host)
    await expect(ctx.remote.session.toolEligibility({} as never)).rejects.toThrow(
      /session\/toolEligibility rejected "request"/,
    )
    await expect(ctx.remote.session.toolEligibility({ sessionId: host.sessionId })).resolves.toEqual({
      ok: true,
      value: {
        allow: ['read'],
        tools: [READ_SCHEMA],
      },
    })
  })
})
