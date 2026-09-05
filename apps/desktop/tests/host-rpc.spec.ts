import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import { REMOTE_PROTOCOL_LIMITS } from '@deepseek-ai/dsh-remote-protocol'
import {
  bootstrapDesktopHostCookie, createDesktopHostRpc, listDesktopHostSessions,
} from '../src/host-rpc.ts'

const closeServers: Array<() => Promise<void>> = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(closeServers.splice(0).map(close => close()))
})

describe('Desktop Host RPC', () => {
  it('rejects response bounds outside the Companion application-message ceiling', () => {
    expect(() => createDesktopHostRpc('http://127.0.0.1', { responseMaxBytes: 0 }))
      .toThrow(/positive safe integer within the Companion message ceiling/)
    expect(() => createDesktopHostRpc('http://127.0.0.1', {
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes + 1,
    })).toThrow(/positive safe integer within the Companion message ceiling/)
    expect(() => createDesktopHostRpc('http://127.0.0.1', {
      responseMaxBytes: 1, attachmentTimeoutMs: 0,
    })).toThrow('attachmentTimeoutMs must be a positive safe integer')
  })

  it('preserves success, HTTP 400, wire failure, business refusal, and timeout as typed results', async () => {
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk) => { chunks.push(chunk as Buffer) })
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          rpcId: string
          payload: { query: string }
        }
        switch (body.payload.query) {
          case 'http-400':
            response.writeHead(400).end('body is not JSON')
            return
          case 'wire-invalid':
            response.end('{not json')
            return
          case 'business':
            response.end(JSON.stringify({
              type: 'server-response',
              rpcId: body.rpcId,
              result: { ok: false, error: { code: 'bad-request', message: 'invalid search query', details: {} } },
            }))
            return
          case 'gateway-internal':
            response.end(JSON.stringify({
              type: 'server-response',
              rpcId: body.rpcId,
              result: {
                ok: false,
                error: {
                  code: 'gateway/internal',
                  message: 'session search failed: SESSION_QUERY_SEARCH_DISABLED',
                  details: {},
                },
              },
            }))
            return
          case 'session-internal':
            response.end(JSON.stringify({
              type: 'server-response',
              rpcId: body.rpcId,
              result: {
                ok: false,
                error: {
                  code: 'session/internal',
                  message: 'session search failed: SESSION_QUERY_SEARCH_DISABLED',
                  details: {},
                },
              },
            }))
            return
          case 'illegal-host-code':
            response.end(JSON.stringify({
              type: 'server-response',
              rpcId: body.rpcId,
              result: {
                ok: false,
                error: {
                  code: 'https://evil.example/internal',
                  message: 'session search failed: SESSION_QUERY_SEARCH_DISABLED',
                  details: {},
                },
              },
            }))
            return
          case 'overlong-host-code':
            response.end(JSON.stringify({
              type: 'server-response',
              rpcId: body.rpcId,
              result: {
                ok: false,
                error: {
                  code: `gateway/${'a'.repeat(128)}`,
                  message: 'session search failed: SESSION_QUERY_SEARCH_DISABLED',
                  details: {},
                },
              },
            }))
            return
          case 'empty-host-code':
            response.end(JSON.stringify({
              type: 'server-response',
              rpcId: body.rpcId,
              result: {
                ok: false,
                error: {
                  code: '',
                  message: 'session search failed: SESSION_QUERY_SEARCH_DISABLED',
                  details: {},
                },
              },
            }))
            return
          case 'numeric-host-code':
            response.end(JSON.stringify({
              type: 'server-response',
              rpcId: body.rpcId,
              result: {
                ok: false,
                error: {
                  code: 1,
                  message: 'session search failed: SESSION_QUERY_SEARCH_DISABLED',
                  details: {},
                },
              },
            }))
            return
          case 'newline-host-code':
            response.end(JSON.stringify({
              type: 'server-response',
              rpcId: body.rpcId,
              result: {
                ok: false,
                error: {
                  code: 'gateway/\ninternal',
                  message: 'session search failed: SESSION_QUERY_SEARCH_DISABLED',
                  details: {},
                },
              },
            }))
            return
          case 'empty-segment-host-code':
            response.end(JSON.stringify({
              type: 'server-response',
              rpcId: body.rpcId,
              result: {
                ok: false,
                error: {
                  code: 'gateway//internal',
                  message: 'session search failed: SESSION_QUERY_SEARCH_DISABLED',
                  details: {},
                },
              },
            }))
            return
          case 'utf8-boundary': {
            const prefix = '[gateway/internal] '
            const remaining = REMOTE_PROTOCOL_LIMITS.hostFailureMessageBytes - Buffer.byteLength(prefix)
            response.end(JSON.stringify({
              type: 'server-response',
              rpcId: body.rpcId,
              result: {
                ok: false,
                error: {
                  code: 'gateway/internal',
                  message: `${'你'.repeat(Math.floor(remaining / 3) + 1)}session search failed`,
                  details: {},
                },
              },
            }))
            return
          }
          case 'utf8-3byte-cross':
          case 'utf8-emoji-cross':
          case 'utf8-legal-fffd': {
            const prefix = '[gateway/internal] '
            const remaining = REMOTE_PROTOCOL_LIMITS.hostFailureMessageBytes - Buffer.byteLength(prefix)
            const message = body.payload.query === 'utf8-3byte-cross'
              ? `${'a'.repeat(remaining - 2)}\u4f60`
              : body.payload.query === 'utf8-emoji-cross'
                ? `${'a'.repeat(remaining - 3)}\u{1F600}`
                : `${'a'.repeat(remaining - 3)}\uFFFD${'x'}`
            response.end(JSON.stringify({
              type: 'server-response',
              rpcId: body.rpcId,
              result: {
                ok: false,
                error: { code: 'gateway/internal', message, details: {} },
              },
            }))
            return
          }
          case 'timeout':
            return
          case 'slow-chunks':
            response.write('{"type":"server-response","rpcId":' + JSON.stringify(body.rpcId) + ',"result":')
            setTimeout(() => { response.write('{"ok":true,') }, 35)
            setTimeout(() => { response.end('"value":{}}}') }, 70)
            return
          default:
            response.end(JSON.stringify({
              type: 'server-response',
              rpcId: body.rpcId,
              result: { ok: true, value: { items: [], hasMore: false } },
            }))
        }
      })
    })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    closeServers.push(async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error === undefined) resolve(); else reject(error) })
      })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('expected TCP address')
    const rpc = createDesktopHostRpc(`http://127.0.0.1:${String(address.port)}`, {
      timeoutMs: 25,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    })

    await expect(rpc.call('session/search', { query: 'ok' })).resolves.toMatchObject({
      ok: true,
      value: { items: [], hasMore: false },
    })
    await expect(rpc.call('session/search', { query: 'http-400' })).resolves.toEqual({
      ok: false,
      failure: { kind: 'http', code: 'HOST_HTTP_STATUS', message: 'Desktop Host returned HTTP 400', status: 400 },
    })
    await expect(rpc.call('session/search', { query: 'wire-invalid' })).resolves.toEqual({
      ok: false,
      failure: { kind: 'wire', code: 'HOST_WIRE_INVALID', message: 'Desktop Host response was not valid RPC JSON' },
    })
    await expect(rpc.call('session/search', { query: 'business' })).resolves.toEqual({
      ok: false,
      failure: { kind: 'business', code: 'bad-request', message: 'invalid search query' },
    })
    await expect(rpc.call('session/search', { query: 'gateway-internal' })).resolves.toEqual({
      ok: false,
      failure: {
        kind: 'business',
        code: 'internal',
        message: '[gateway/internal] session search failed: SESSION_QUERY_SEARCH_DISABLED',
      },
    })
    const sessionInternal = await rpc.call('session/search', { query: 'session-internal' })
    const gatewayInternal = await rpc.call('session/search', { query: 'gateway-internal' })
    expect(sessionInternal).toEqual({
      ok: false,
      failure: {
        kind: 'business',
        code: 'internal',
        message: '[session/internal] session search failed: SESSION_QUERY_SEARCH_DISABLED',
      },
    })
    expect(gatewayInternal.ok).toBe(false)
    expect(sessionInternal.ok).toBe(false)
    if (gatewayInternal.ok || sessionInternal.ok) throw new Error('expected namespaced Host business failures')
    expect(gatewayInternal.failure.kind).toBe(sessionInternal.failure.kind)
    expect(gatewayInternal.failure.code).toBe(sessionInternal.failure.code)
    expect(gatewayInternal.failure.message).not.toBe(sessionInternal.failure.message)
    expect(gatewayInternal.failure.message).toContain('[gateway/internal] ')
    expect(sessionInternal.failure.message).toContain('[session/internal] ')
    expect(gatewayInternal.failure.message).toContain('session search failed')
    expect(sessionInternal.failure.message).toContain('session search failed')
    await expect(rpc.call('session/search', { query: 'illegal-host-code' })).resolves.toEqual({
      ok: false,
      failure: {
        kind: 'wire',
        code: 'HOST_WIRE_INVALID',
        message: 'Desktop Host business error code was invalid',
      },
    })
    await expect(rpc.call('session/search', { query: 'overlong-host-code' })).resolves.toEqual({
      ok: false,
      failure: {
        kind: 'wire',
        code: 'HOST_WIRE_INVALID',
        message: 'Desktop Host business error code was invalid',
      },
    })
    const invalidHostCode = {
      ok: false as const,
      failure: {
        kind: 'wire' as const,
        code: 'HOST_WIRE_INVALID' as const,
        message: 'Desktop Host business error code was invalid',
      },
    }
    await expect(rpc.call('session/search', { query: 'empty-host-code' })).resolves.toEqual(invalidHostCode)
    await expect(rpc.call('session/search', { query: 'numeric-host-code' })).resolves.toEqual(invalidHostCode)
    await expect(rpc.call('session/search', { query: 'newline-host-code' })).resolves.toEqual(invalidHostCode)
    await expect(rpc.call('session/search', { query: 'empty-segment-host-code' })).resolves.toEqual(invalidHostCode)
    const utf8Boundary = await rpc.call('session/search', { query: 'utf8-boundary' })
    expect(utf8Boundary).toMatchObject({
      ok: false,
      failure: { kind: 'business', code: 'internal' },
    })
    if (utf8Boundary.ok || utf8Boundary.failure.kind !== 'business') {
      throw new Error('expected a truncated namespaced Host business failure')
    }
    expect(Buffer.byteLength(utf8Boundary.failure.message)).toBeLessThanOrEqual(
      REMOTE_PROTOCOL_LIMITS.hostFailureMessageBytes,
    )
    expect(utf8Boundary.failure.message.startsWith('[gateway/internal] ')).toBe(true)
    expect(utf8Boundary.failure.message).not.toMatch(/\uFFFD/u)
    expect(utf8Boundary.failure.message.length).toBeGreaterThan('[gateway/internal] '.length)
    const threeByte = await rpc.call('session/search', { query: 'utf8-3byte-cross' })
    const emoji = await rpc.call('session/search', { query: 'utf8-emoji-cross' })
    const legalReplacement = await rpc.call('session/search', { query: 'utf8-legal-fffd' })
    expectPrefixedUtf8Budget(threeByte, { last: 'a', forbidden: '\u4f60' })
    expectPrefixedUtf8Budget(emoji, { last: 'a', forbidden: '\u{1F600}' })
    expectPrefixedUtf8Budget(legalReplacement, { last: '\uFFFD' })
    await expect(rpc.call('session/search', { query: 'timeout' })).resolves.toEqual({
      ok: false,
      failure: { kind: 'timeout', code: 'HOST_TIMEOUT', message: 'Desktop Host request timed out' },
    })
    await expect(rpc.call('session/admitAttachment', { query: 'slow-chunks' }, { timeoutMs: 100 }))
      .resolves.toMatchObject({ ok: true, value: {} })
    const deadlineRpc = createDesktopHostRpc(`http://127.0.0.1:${String(address.port)}`, {
      timeoutMs: 50,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    })
    await expect(deadlineRpc.call('session/search', { query: 'slow-chunks' })).resolves.toEqual({
      ok: false,
      failure: { kind: 'timeout', code: 'HOST_TIMEOUT', message: 'Desktop Host request timed out' },
    })
  })

  it('exchanges the same-origin launch token and sends the cookie on unary calls', async () => {
    const cookies: string[] = []
    const methods: string[] = []
    const server = createServer((request, response) => {
      if (request.method === 'GET') {
        if (request.url === '/off-origin/?token=launch') {
          response.writeHead(303, {
            location: 'http://127.0.0.1:9/',
            'set-cookie': 'dsh-auth-x=stolen; Path=/; HttpOnly; SameSite=Strict',
          }).end()
          return
        }
        response.writeHead(303, {
          location: '/',
          'set-cookie': [
            'dsh-auth-x=session; Path=/; HttpOnly; SameSite=Strict',
            'dsh-extra=keep; Path=/; HttpOnly; SameSite=Strict',
          ],
        }).end()
        return
      }
      cookies.push(request.headers.cookie ?? '')
      const chunks: Buffer[] = []
      request.on('data', chunk => chunks.push(chunk as Buffer))
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          rpcId: string
          method: string
          payload: { args: { _request: object } }
        }
        methods.push(body.method)
        expect(body.payload).toEqual({ args: { _request: {} } })
        response.end(JSON.stringify({
          type: 'server-response',
          rpcId: body.rpcId,
          result: { ok: true, value: { items: [] } },
        }))
      })
    })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    closeServers.push(async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error === undefined) resolve(); else reject(error) })
      })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('expected TCP address')
    const origin = `http://127.0.0.1:${String(address.port)}`
    await expect(bootstrapDesktopHostCookie(`${origin}/off-origin/?token=launch`, origin))
      .rejects.toThrow(/same-origin loopback launch URL/)
    await expect(bootstrapDesktopHostCookie(`${origin}/?token=launch`, 'http://127.0.0.1:9'))
      .rejects.toThrow(/same-origin loopback launch URL/)
    const cookie = await bootstrapDesktopHostCookie(`${origin}/?token=launch`, origin)
    expect(cookie).toBe('dsh-auth-x=session; dsh-extra=keep')
    const rpc = createDesktopHostRpc(origin, {
      timeoutMs: 1_000,
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
      cookieHeader: cookie,
    })
    const listed = await listDesktopHostSessions(rpc)
    expect(listed.ok).toBe(true)
    expect(cookies).toEqual(['dsh-auth-x=session; dsh-extra=keep'])
    expect(methods).toEqual(['session/list'])
  })

  it('accepts the exact response byte limit and rejects overflow and a fast cumulative flood', async () => {
    const padding = 'x'.repeat(1_024)
    const pagePadding = 'h'.repeat(REMOTE_PROTOCOL_LIMITS.companionMessageBytes + 1)
    const baselinePadding = 'b'.repeat(REMOTE_PROTOCOL_LIMITS.companionMessageBytes + 1)
    const baselineResponseMaxBytes = REMOTE_PROTOCOL_LIMITS.transcriptPageBytes
      * REMOTE_PROTOCOL_LIMITS.transcriptPageEntries
    const responseBytes = Buffer.byteLength(successResponse('0'.repeat(36), padding))
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', chunk => chunks.push(chunk as Buffer))
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          rpcId: string
          method: string
          payload: { query: string }
        }
        if (body.method === 'session/page') {
          response.end(successResponse(body.rpcId, pagePadding))
          return
        }
        if (body.method === 'session/list') {
          if (body.payload.query === 'oversized-baseline') {
            response.end(Buffer.alloc(baselineResponseMaxBytes + 1, 120))
            return
          }
          response.end(successResponse(body.rpcId, baselinePadding))
          return
        }
        if (body.payload.query === 'fast-flood') {
          response.on('error', () => {})
          for (let index = 0; index < 32; index += 1) response.write(Buffer.alloc(256, 120))
          response.end()
          return
        }
        response.end(successResponse(body.rpcId, padding))
      })
    })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    closeServers.push(async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error === undefined) resolve(); else reject(error) })
      })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('expected TCP address')
    const origin = `http://127.0.0.1:${String(address.port)}`
    const exact = createDesktopHostRpc(origin, { timeoutMs: 1_000, responseMaxBytes: responseBytes })
    const overflow = createDesktopHostRpc(origin, { timeoutMs: 1_000, responseMaxBytes: responseBytes - 1 })
    const flood = createDesktopHostRpc(origin, { timeoutMs: 1_000, responseMaxBytes: 1_024 })
    const attachment = createDesktopHostRpc(origin, {
      timeoutMs: 1, attachmentTimeoutMs: 1_000, responseMaxBytes: 1,
    })

    await expect(exact.call('session/search', { query: 'exact' })).resolves.toMatchObject({
      ok: true,
      value: { padding },
    })
    const limitFailure = {
      ok: false,
      failure: {
        kind: 'wire', code: 'HOST_WIRE_INVALID', message: 'Desktop Host response exceeded its byte limit',
      },
    } as const
    await expect(overflow.call('session/search', { query: 'overflow' })).resolves.toEqual(limitFailure)
    await expect(flood.call('session/search', { query: 'fast-flood' })).resolves.toEqual(limitFailure)
    await expect(flood.call('session/page', { query: 'page' })).resolves.toMatchObject({
      ok: true, value: { padding: pagePadding },
    })
    await expect(flood.call('session/list', { query: 'baseline' })).resolves.toMatchObject({
      ok: true, value: { padding: baselinePadding },
    })
    await expect(flood.call('session/list', { query: 'oversized-baseline' })).resolves.toEqual(limitFailure)
    await expect(attachment.call('session/attachment', { query: 'attachment' })).resolves.toMatchObject({
      ok: true, value: { padding },
    })
  })

  it('preserves non-2xx status before an oversized or never-ending response body', async () => {
    const closedResponses = new Set<string>()
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', chunk => chunks.push(chunk as Buffer))
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          payload: { query: string }
        }
        const query = body.payload.query
        response.on('close', () => { closedResponses.add(query) })
        response.on('error', () => {})
        response.writeHead(400)
        response.flushHeaders()
        if (query === 'oversized') {
          response.end(Buffer.alloc(2_048, 120))
          return
        }
        response.write('partial')
      })
    })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    closeServers.push(async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error === undefined) resolve(); else reject(error) })
      })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('expected TCP address')
    const rpc = createDesktopHostRpc(`http://127.0.0.1:${String(address.port)}`, {
      timeoutMs: 50,
      responseMaxBytes: 1_024,
    })
    const httpFailure = {
      ok: false,
      failure: { kind: 'http', code: 'HOST_HTTP_STATUS', message: 'Desktop Host returned HTTP 400', status: 400 },
    } as const

    await expect(Promise.all([
      rpc.call('session/search', { query: 'oversized' }),
      rpc.call('session/search', { query: 'never-ending' }),
    ])).resolves.toEqual([httpFailure, httpFailure])
    await expect.poll(() => closedResponses.size).toBe(2)
  })

  it('opens generated session/follow on /api/remote.mux with the bootstrap cookie', async () => {
    const opens: unknown[] = []
    const cookies: string[] = []
    const server = createServer()
    const wss = new WebSocketServer({ noServer: true })
    server.on('upgrade', (request, socket, head) => {
      cookies.push(request.headers.cookie ?? '')
      expect(request.url).toBe('/api/remote.mux')
      wss.handleUpgrade(request, socket, head, (websocket) => {
        websocket.on('message', (data) => {
          const text = typeof data === 'string' ? data : Buffer.from(data as Uint8Array).toString('utf8')
          const message = JSON.parse(text) as { type: string; streamId: string; endpoint?: string; payload?: unknown }
          if (message.type === 'open') {
            opens.push({ endpoint: message.endpoint, payload: message.payload })
            websocket.send(JSON.stringify({
              type: 'item', streamId: message.streamId, value: { type: 'snapshot', cursor: 0 },
            }))
          }
          if (message.type === 'cancel') websocket.close()
        })
      })
    })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    closeServers.push(async () => {
      wss.close()
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error === undefined) resolve(); else reject(error) })
      })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('expected TCP address')
    const origin = `http://127.0.0.1:${String(address.port)}`
    const rpc = createDesktopHostRpc(origin, {
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
      cookieHeader: 'dsh-auth-x=session',
    })
    const frames: unknown[] = []
    const cancellation = new AbortController()
    const watching = rpc.followSession?.('session-follow', cancellation.signal, (frame) => {
      frames.push(frame)
      cancellation.abort()
    })
    await expect(watching).resolves.toBeUndefined()
    expect(cookies).toEqual(['dsh-auth-x=session'])
    expect(opens).toEqual([{
      endpoint: 'session/follow',
      payload: { args: { request: { address: { kind: 'session', sessionId: 'session-follow' } } } },
    }])
    expect(frames).toEqual([{ type: 'snapshot', cursor: 0 }])
  })

  it('opens generated workspace/follow on /api/remote.mux with empty args', async () => {
    const opens: unknown[] = []
    const cookies: string[] = []
    const server = createServer()
    const wss = new WebSocketServer({ noServer: true })
    server.on('upgrade', (request, socket, head) => {
      cookies.push(request.headers.cookie ?? '')
      expect(request.url).toBe('/api/remote.mux')
      wss.handleUpgrade(request, socket, head, (websocket) => {
        websocket.on('message', (data) => {
          const text = typeof data === 'string' ? data : Buffer.from(data as Uint8Array).toString('utf8')
          const message = JSON.parse(text) as { type: string; streamId: string; endpoint?: string; payload?: unknown }
          if (message.type === 'open') {
            opens.push({ endpoint: message.endpoint, payload: message.payload })
            websocket.send(JSON.stringify({
              type: 'item', streamId: message.streamId,
              value: { type: 'baseline', value: { items: [], archivedSessionIds: [] } },
            }))
          }
          if (message.type === 'cancel') websocket.close()
        })
      })
    })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    closeServers.push(async () => {
      wss.close()
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error === undefined) resolve(); else reject(error) })
      })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('expected TCP address')
    const origin = `http://127.0.0.1:${String(address.port)}`
    const rpc = createDesktopHostRpc(origin, {
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
      cookieHeader: 'dsh-auth-x=session',
    })
    const frames: unknown[] = []
    const cancellation = new AbortController()
    const watching = rpc.followWorkspaces?.(cancellation.signal, (frame) => {
      frames.push(frame)
      cancellation.abort()
    })
    await expect(watching).resolves.toBeUndefined()
    expect(cookies).toEqual(['dsh-auth-x=session'])
    expect(opens).toEqual([{ endpoint: 'workspace/follow', payload: { args: {} } }])
    expect(frames).toEqual([{ type: 'baseline', value: { items: [], archivedSessionIds: [] } }])
  })
})

function successResponse(rpcId: string, padding: string): string {
  return JSON.stringify({
    type: 'server-response',
    rpcId,
    result: { ok: true, value: { padding } },
  })
}

function expectPrefixedUtf8Budget(
  result: Awaited<ReturnType<ReturnType<typeof createDesktopHostRpc>['call']>>,
  options: { last: string; forbidden?: string },
): void {
  const prefix = '[gateway/internal] '
  expect(result).toMatchObject({ ok: false, failure: { kind: 'business', code: 'internal' } })
  if (result.ok || result.failure.kind !== 'business') {
    throw new Error('expected a truncated namespaced Host business failure')
  }
  const message = result.failure.message
  expect(message.startsWith(prefix)).toBe(true)
  expect(Buffer.byteLength(message)).toBeLessThanOrEqual(REMOTE_PROTOCOL_LIMITS.hostFailureMessageBytes)
  expect(() => new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(message))).not.toThrow()
  const original = message.slice(prefix.length)
  expect(original.at(-1)).toBe(options.last)
  if (options.forbidden !== undefined) expect(original).not.toContain(options.forbidden)
}
