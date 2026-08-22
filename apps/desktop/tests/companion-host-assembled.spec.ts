import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { createApiProxy, toFetchHandler } from '@deepseek-ai/dsh-host-apiproxy'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import {
  parseCompanionOperationId,
  REMOTE_PROTOCOL_LIMITS,
  type CompanionSearchSessionsOperation,
} from '@deepseek-ai/dsh-remote-protocol'
import SessionStore, { SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session'
import SqliteSessionQueryEngine from '@deepseek-ai/dsh-session-query-sqlite'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { DesktopCompanionProductOwner } from '../src/companion-product.ts'
import { runHost400CodecProbe } from './host-400-codec-probe.ts'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

describe('assembled Desktop Companion Host search', () => {
  it('indexes a real Desktop Session and returns authoritative hit and no-hit results', async () => {
    const assembled = await startDesktopHost('indexed', 'desktop assembled SQLite needle')
    const owner = productOwner(assembled.url)

    let hit = await search(owner, 'desktop assembled SQLite needle', 'assembled-hit')
    await expect.poll(async () => {
      hit = await search(owner, 'desktop assembled SQLite needle', 'assembled-hit')
      return hit.type === 'session-search'
        && hit.items.some(item => item.sessionId === assembled.sessionId && item.snippet.includes('SQLite needle'))
    }, { timeout: 15_000 }).toBe(true)
    expect(hit).toMatchObject({
      type: 'session-search',
      hasMore: false,
    })
    await expect(search(owner, 'definitely absent companion phrase', 'assembled-no-hit')).resolves.toEqual({
      type: 'session-search',
      operationId: parseCompanionOperationId('assembled-no-hit'),
      items: [],
      hasMore: false,
    })
  }, 45_000)

  it('encodes a real Host HTTP 400 as one Companion result', async () => {
    await expect(runHost400CodecProbe()).resolves.toBeInstanceOf(Uint8Array)
  })

  it.each(['disabled', 'index-failure'] as const)(
    'projects a real Desktop %s search-provider failure',
    async (scenario) => {
      const assembled = await startDesktopHost(scenario, `desktop ${scenario} needle`)
      const owner = productOwner(assembled.url)

      const failure = await search(owner, `desktop ${scenario} needle`, `assembled-${scenario}`)
      expect(failure).toMatchObject({
        type: 'operation-failed',
        operationId: parseCompanionOperationId(`assembled-${scenario}`),
        failure: {
          kind: 'business',
          code: 'internal',
        },
      })
      if (failure.type !== 'operation-failed') throw new Error('expected search failure')
      expect(failure.failure.message).toContain('session search failed')
    },
    45_000,
  )
})

async function startDesktopHost(
  scenario: 'indexed' | 'disabled' | 'index-failure',
  message: string,
): Promise<{ url: string; sessionId: string }> {
  const root = await mkdtemp(join(tmpdir(), 'desktop-companion-assembled-'))
  cleanups.push(async () => { await rm(root, { recursive: true, force: true }) })
  const ctx = new Context()
  const sessions = await ctx.plugin(SessionStore)
  cleanups.push(async () => { await sessions.dispose() })
  const agents = await ctx.plugin(AgentRegistry)
  cleanups.push(async () => { await agents.dispose() })
  const questions = await ctx.plugin(UserQuestionService)
  cleanups.push(async () => { await questions.dispose() })
  const indexPath = scenario === 'index-failure'
    ? join(root, 'index-directory')
    : join(root, 'session-search.sqlite')
  if (scenario === 'index-failure') await mkdir(indexPath)
  const query = await ctx.plugin(SqliteSessionQueryEngine, {
    path: indexPath,
    openAt: scenario === 'disabled' ? 'never' : 'first-search',
  })
  cleanups.push(async () => { await query.dispose() })
  const sessionId = SessionId(`desktop-${scenario}-session`)
  const session = ctx.sessions.create(sessionId, {
    meta: {
      version: SESSION_FORMAT_VERSION,
      id: sessionId,
      createdAt: 1,
      cwd: root,
    },
  })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: message }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'keyless', model: 'assembled' }),
    cwd: root,
  })
  const url = await startHttpCarrier(toFetchHandler(api))
  return { url, sessionId }
}

async function startHttpCarrier(handler: { fetch(request: Request): Promise<Response> }): Promise<string> {
  const server = createServer((request, response) => {
    void (async () => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(chunk as Buffer)
      const fetchResponse = await handler.fetch(new Request(
        new URL(request.url ?? '/', 'http://desktop-companion.test'),
        {
          method: request.method ?? 'GET',
          headers: Object.fromEntries(
            Object.entries(request.headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
          ),
          ...(chunks.length === 0 ? {} : { body: Buffer.concat(chunks) }),
        },
      ))
      response.writeHead(fetchResponse.status, Object.fromEntries(fetchResponse.headers.entries()))
      response.end(Buffer.from(await fetchResponse.arrayBuffer()))
    })().catch((error: unknown) => {
      response.writeHead(500)
      response.end(error instanceof Error ? error.message : String(error))
    })
  })
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen)
      resolveListen()
    })
  })
  cleanups.push(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => { if (error === undefined) resolveClose(); else rejectClose(error) })
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('expected assembled Host TCP address')
  return `http://127.0.0.1:${String(address.port)}`
}

function productOwner(baseUrl: string): DesktopCompanionProductOwner {
  const owner = new DesktopCompanionProductOwner({
    timeoutMs: 10_000,
    responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
  })
  owner.installHost(baseUrl)
  return owner
}

async function search(owner: DesktopCompanionProductOwner, query: string, operationId: string) {
  const operation: CompanionSearchSessionsOperation = {
    type: 'search-sessions',
    operationId: parseCompanionOperationId(operationId),
    query,
  }
  return await owner.handle(operation, {
    pairingId: parsePersonalPairingId('desktop-companion-assembled-pairing'),
    pairingKey: new Uint8Array(32),
    now: Date.now,
    downloadAttachment: () => Promise.reject(new Error('search must not download an attachment')),
    submitAttachment: () => Promise.reject(new Error('search must not submit an attachment')),
  })
}
