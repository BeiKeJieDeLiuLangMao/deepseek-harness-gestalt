import { createServer, request as httpRequest } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection'
import type { BrowserAuth } from '@deepseek-ai/dsh-client-connection/src/browser-auth.ts'
import {
  SESSION_FORMAT_VERSION,
  SessionSeq,
  type SessionEvent,
  type SessionHeader,
  type SessionId,
} from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '../../../session/session-persistence-jsonl/src/index.ts'
import { strFromU8, unzipSync } from 'fflate'
import {
  SESSION_LOG_EXPORT_PATH,
  SESSION_LOG_FILENAME,
  apply,
  inject,
  serializeSessionLog,
  sessionLogZipFilename,
} from '../src/index.ts'

const sid = (value: string): SessionId => value as SessionId

const header: SessionHeader = {
  version: SESSION_FORMAT_VERSION,
  id: sid('jsonl-export-root'),
  createdAt: 1_000,
  isSeeded: false,
  cwd: '/workspace',
  delegationDepth: 0,
}

const events: SessionEvent[] = [
  { type: 'turn/start', seq: SessionSeq(0), time: 2_000, data: { turn: 1 } },
]

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function persistLog(): Promise<{ root: string; persistence: JsonlSessionPersistence }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-session-export-jsonl-'))
  roots.push(root)
  const ctx = new Context()
  await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
  const persistence = ctx.sessionPersistence as JsonlSessionPersistence
  const handle = await persistence.create(header)
  try {
    await handle.append(events)
  } finally {
    await handle.close()
  }
  return { root, persistence }
}

function lineageStub(id: SessionId) {
  const session = { header: { ...header, id }, live: false, persisted: true }
  return {
    traceSession: async () => ({
      target: session,
      ancestors: [],
      complete: true,
      root: session,
      descendants: [],
    }),
  }
}

async function mountedExport(root: string): Promise<{
  readonly fetch: (request: Request) => Promise<Response>
  readonly dispose: () => Promise<void>
}> {
  const ctx = new Context()
  ctx.provide('commands', { register: () => () => {} } as never)
  await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
  ctx.provide('sessionQuery', lineageStub(header.id) as never)
  ctx.provide('attachments', {
    readImage: async () => { throw new Error('fixture has no images') },
  } as never)
  const connection = new HostConnectionService(ctx, [], {} as BrowserAuth)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber
  const shared = connection.createSharedFetchHandler('/api')
  return { fetch: request => shared.fetch(request), dispose: () => fiber.dispose() }
}

describe('Session log export over JSONL persistence', () => {
  it('streams the stored JSONL as a ZIP through GET and HEAD', async () => {
    const { root } = await persistLog()
    const { fetch, dispose } = await mountedExport(root)
    const url = `http://host${SESSION_LOG_EXPORT_PATH}?sessionId=${header.id}`
    const response = await fetch(new Request(url))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/zip')
    expect(response.headers.get('content-disposition'))
      .toBe(`attachment; filename="${sessionLogZipFilename(header.id)}"`)
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()))
    expect(strFromU8(files[SESSION_LOG_FILENAME] as Uint8Array))
      .toBe(serializeSessionLog(header, events))

    const head = await fetch(new Request(url, { method: 'HEAD' }))
    expect(head.status).toBe(200)
    expect(head.body).toBeNull()
    expect(head.headers.get('content-type')).toBe('application/zip')

    expect((await fetch(new Request(
      `http://host${SESSION_LOG_EXPORT_PATH}?sessionId=missing-session`,
    ))).status).toBe(404)
    await dispose()
  })

  it('rejects an unauthenticated HTTP GET before reading persistence', async () => {
    const { root } = await persistLog()
    const ctx = new Context()
    ctx.provide('webServer', {
      register: () => () => {},
    } as never)
    ctx.provide('commands', { register: () => () => {} } as never)
    ctx.provide('credentials', {
      describe: () => ({ credentials: {} }),
    } as never)
    await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
    ctx.provide('sessionQuery', lineageStub(header.id) as never)
    ctx.provide('attachments', {
      readImage: async () => { throw new Error('fixture has no images') },
    } as never)
    const connection = new HostConnectionService(ctx, ['harness.example'], {
      isAuthenticated: () => false,
      authorizeIndex: () => false,
      authenticatedUrl: (base: string) => base,
    } as unknown as BrowserAuth)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber
    const handler = connection.createSharedFetchHandler('/api')
    const server = createServer((request, response) => {
      const rejection = connection.requestRejection(request)
      if (rejection !== undefined) {
        response.writeHead(rejection)
        response.end(rejection === 401 ? 'unauthorized' : 'forbidden')
        return
      }
      void handler.fetch(new Request(`http://harness.example${request.url ?? '/'}`)).then(async (res) => {
        response.writeHead(res.status, Object.fromEntries(res.headers))
        if (res.body === null) {
          response.end()
          return
        }
        response.end(Buffer.from(await res.arrayBuffer()))
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const request = httpRequest({
          host: '127.0.0.1',
          port,
          path: `${SESSION_LOG_EXPORT_PATH}?sessionId=${header.id}`,
          method: 'GET',
          headers: { host: 'harness.example' },
        }, (res) => {
          res.resume()
          res.on('end', () => { resolve(res.statusCode ?? 0) })
        })
        request.on('error', reject)
        request.end()
      })
      expect(status).toBe(401)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined || error === null) resolve()
          else reject(error)
        })
      })
      await fiber.dispose()
    }
  })
})
