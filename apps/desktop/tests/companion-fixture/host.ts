import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import { createApiProxy, toFetchHandler } from '@deepseek-ai/dsh-host-apiproxy'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import { WebSocketDownlinks } from '@deepseek-ai/dsh-client-connection/src/websocket-downlink.ts'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SqliteSessionPersistence from '@deepseek-ai/dsh-session-persistence-sqlite'
import SqliteSessionQueryEngine from '@deepseek-ai/dsh-session-query-sqlite'
import Storage from '@deepseek-ai/dsh-storage'
import * as SqliteStorage from '@deepseek-ai/dsh-storage-sqlite'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import WorkspaceRegistry, { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { runHost400CodecProbe } from './host-400-codec-probe.ts'
import { isFixtureRequest, type FixtureCommand, type FixtureResponse, type FixtureResults } from './wire.ts'

const cleanups: Array<() => Promise<void>> = []
let assembled: Awaited<ReturnType<typeof startDesktopHost>> | undefined
const settlements = new Map<'question' | 'approval', Promise<FixtureResults['settlement']>>()

// Concurrent dispatch lets a settlement wait coexist with the Mobile response that completes it.
process.on('message', (request: unknown) => {
  if (!isFixtureRequest(request)) {
    process.exitCode = 1
    console.error('Invalid Companion fixture request')
    process.disconnect?.()
    return
  }
  void dispatch(request.command).then(
    (value) => { reply({ id: request.id, ok: true, value }) },
    (error: unknown) => {
      reply({ id: request.id, ok: false, error: error instanceof Error ? error.stack ?? error.message : String(error) })
    },
  ).then(() => { if (request.command.type === 'dispose') process.disconnect?.() })
})
process.once('disconnect', () => {
  void dispose().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
})

function reply(response: FixtureResponse): void {
  if (process.connected) process.send?.(response)
}

async function dispose(): Promise<void> {
  const errors: unknown[] = []
  for (const cleanup of cleanups.splice(0).reverse()) {
    try { await cleanup() } catch (error) { errors.push(error) }
  }
  if (errors.length > 0) throw new AggregateError(errors, 'Companion fixture cleanup failed')
}

async function dispatch(command: FixtureCommand): Promise<unknown> {
  if (command.type === 'dispose') {
    await dispose()
    return
  }
  if (command.type === 'codec') return await runHost400CodecProbe()
  if (command.type === 'start') {
    if (assembled !== undefined) throw new Error('Companion fixture already started')
    assembled = await startDesktopHost(command.scenario, command.message, command.enableCreation)
    const { url, root, sessionId, image } = assembled
    return { url, root, sessionId, image }
  }
  if (assembled === undefined) throw new Error('Companion fixture is not started')
  const { ctx, agent } = assembled
  switch (command.type) {
    case 'create-session':
      ctx.sessions.create(command.id, { meta: { createdAt: command.createdAt, cwd: command.cwd } })
      return
    case 'append': {
      const session = ctx.sessions.get(command.id)
      if (session === undefined) throw new Error(`Missing fixture Session ${command.id}`)
      session.append(command.event, command.data)
      return
    }
    case 'message': {
      const session = ctx.sessions.get(command.id)
      if (session === undefined) throw new Error(`Missing fixture Session ${command.id}`)
      session.append('user/message', createUserMessage({ content: [{ type: 'text', text: command.text }], source: { kind: 'user' } }), { surfaceOp: 'append' })
      return
    }
    case 'events': return ctx.sessions.get(command.id)?.events
    case 'cancelled': return assembled.cancelled.value
    case 'workspace-create': return { id: (await ctx.workspaceRegistry.create(command.root, command.name)).id }
    case 'workspace-attach': {
      const workspace = ctx.workspaceRegistry.get(WorkspaceId(command.workspaceId))
      if (workspace === undefined) throw new Error(`Missing fixture Workspace ${command.workspaceId}`)
      await workspace.attachSession(command.sessionId)
      return
    }
    case 'workspace-reorder': return await ctx.workspaceRegistry.insertBefore(WorkspaceId(command.workspaceId))
    case 'workspace-delete': return await ctx.workspaceRegistry.delete(WorkspaceId(command.workspaceId))
    case 'archive':
      await ctx.workspaceRegistry.archiveSession(command.sessionId)
      return
    case 'question': {
      const pending = ctx.userQuestions.ask({ agent, questions: [{ id: 'target', question: 'Choose target', options: [{ label: 'Code' }, { label: 'Docs' }] }] })
      settlements.set('question', pending)
      void pending.catch(() => { /* The settlement command observes this rejection. */ })
      return 'question'
    }
    case 'approval': {
      const pending = ctx.approval.request({ agent, toolName: 'bash', reason: 'assembled Companion approval' })
      settlements.set('approval', pending)
      void pending.catch(() => { /* The settlement command observes this rejection. */ })
      return 'approval'
    }
    case 'settlement': {
      const pending = settlements.get(command.token)
      if (pending === undefined) throw new Error(`Missing fixture settlement ${command.token}`)
      return await pending
    }
  }
}

/** Original assembled Host composition, owned only by this Node fixture process. */
async function startDesktopHost(scenario: 'indexed' | 'disabled' | 'index-failure', message: string, enableCreation: boolean) {
  const root = await mkdtemp(join(tmpdir(), 'desktop-companion-assembled-'))
  cleanups.push(async () => { await rm(root, { recursive: true, force: true }) })
  const ctx = new Context()
  const sessions = await ctx.plugin(SessionStore)
  cleanups.push(async () => { await sessions.dispose() })
  const persistence = await ctx.plugin(SqliteSessionPersistence, { path: join(root, 'sessions.sqlite') })
  cleanups.push(async () => { await persistence.dispose() })
  const agents = await ctx.plugin(AgentRegistry)
  cleanups.push(async () => { await agents.dispose() })
  const questions = await ctx.plugin(UserQuestionService)
  cleanups.push(async () => { await questions.dispose() })
  const systemPrompt = await ctx.plugin(SystemPrompt, { persona: '' })
  cleanups.push(async () => { await systemPrompt.dispose() })
  if (enableCreation) {
    const llm = await ctx.plugin(LlmRuntime)
    cleanups.push(async () => { await llm.dispose() })
    const tools = await ctx.plugin(ToolRuntime)
    cleanups.push(async () => { await tools.dispose() })
    const agentLoop = await ctx.plugin(AgentLoop, { agents: [] })
    cleanups.push(async () => { await agentLoop.dispose() })
  }
  const approval = await ctx.plugin(ApprovalService)
  cleanups.push(async () => { await approval.dispose() })
  const attachments = await ctx.plugin(LocalAttachmentStore, { dshHome: root })
  cleanups.push(async () => { await attachments.dispose() })
  const storage = await ctx.plugin(Storage)
  cleanups.push(async () => { await storage.dispose() })
  const sqliteStorage = await ctx.plugin(SqliteStorage, { path: join(root, 'domain.sqlite') })
  cleanups.push(async () => { await sqliteStorage.dispose() })
  const storageDomain = new DomainFacility(ctx, { backend: 'sqlite', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  const workspaces = await ctx.plugin(WorkspaceRegistry)
  cleanups.push(async () => { await workspaces.dispose() })
  const indexPath = scenario === 'index-failure' ? join(root, 'index-directory') : join(root, 'session-search.sqlite')
  if (scenario === 'index-failure') await mkdir(indexPath)
  const query = await ctx.plugin(SqliteSessionQueryEngine, { path: indexPath, openAt: scenario === 'disabled' ? 'never' : 'first-search' })
  cleanups.push(async () => { await query.dispose() })
  const sessionId = SessionId(`desktop-${scenario}-session`)
  const session = ctx.sessions.create(sessionId, { meta: { createdAt: 1, cwd: root } })
  const cancelled = { value: 0 }
  const agent = {
    id: session.id, session, status: 'running', ctx, inbox: { nextTurn: [], nextStep: [] },
    followup(messageValue: ReturnType<typeof createUserMessage>) { session.append('user/message', messageValue, { surfaceOp: 'append' }) },
    steer(messageValue: ReturnType<typeof createUserMessage>) { session.append('user/message', messageValue, { surfaceOp: 'append' }) },
    cancel() { cancelled.value += 1 },
  } as unknown as Agent
  ctx.agents.register(agent)
  const image = (await ctx.attachments.saveImages([{ mediaType: 'image/png', data: readFileSync(new URL('../../build/icon.png', import.meta.url)) }]))[0]
  if (image === undefined) throw new Error('assembled image admission returned no reference')
  session.append('user/message', createUserMessage({ content: [{ type: 'text', text: message }, { type: 'image', attachment: image }], source: { kind: 'user' } }), { surfaceOp: 'append' })
  const api = createApiProxy(ctx, { defaultModelSelection: () => ({ provider: 'assembled-provider', model: 'assembled-model' }), cwd: root })
  const url = await startHttpCarrier(toFetchHandler(api), new WebSocketDownlinks(api))
  return { url, root, sessionId, session, image, cancelled, ctx, agent }
}

async function startHttpCarrier(handler: { fetch(request: Request): Promise<Response> }, downlinks: WebSocketDownlinks): Promise<string> {
  const server = createServer((request, response) => {
    void (async () => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(chunk as Buffer)
      const fetchResponse = await handler.fetch(new Request(new URL(request.url ?? '/', 'http://desktop-companion.test'), {
        method: request.method ?? 'GET',
        headers: Object.fromEntries(Object.entries(request.headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
        ...(chunks.length === 0 ? {} : { body: Buffer.concat(chunks) }),
      }))
      response.writeHead(fetchResponse.status, Object.fromEntries(fetchResponse.headers.entries()))
      if (fetchResponse.body === null) { response.end(); return }
      const reader = fetchResponse.body.getReader()
      while (true) {
        const readResult: unknown = await reader.read()
        if (!isRecord(readResult) || typeof readResult.done !== 'boolean') throw new Error('assembled Host stream returned an invalid read result')
        if (readResult.done) break
        if (!(readResult.value instanceof Uint8Array)) throw new Error('assembled Host stream returned an invalid byte chunk')
        response.write(Buffer.from(readResult.value))
      }
      response.end()
    })().catch((error: unknown) => {
      response.writeHead(500)
      response.end(error instanceof Error ? error.message : String(error))
    })
  })
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://desktop-companion.test').pathname
    if (pathname === '/api/events.mux') downlinks.handleMux(request, socket, head)
    else if (pathname === '/api/events.host') downlinks.handleHost(request, socket, head)
    else socket.destroy()
  })
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => { server.off('error', rejectListen); resolveListen() })
  })
  cleanups.push(async () => {
    await downlinks.close()
    server.closeAllConnections()
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => { if (error === undefined) resolveClose(); else rejectClose(error) })
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('expected assembled Host TCP address')
  return `http://127.0.0.1:${String(address.port)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
