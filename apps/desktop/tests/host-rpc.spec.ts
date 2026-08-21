import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { createDesktopHostRpc } from '../src/host-rpc.ts'

describe('Desktop Host RPC', () => {
  it('posts unary JSON without constructing a Chromium Request and parses mux SSE', async () => {
    const seen: string[] = []
    const server = createServer((request, response) => {
      seen.push(`${request.method ?? ''} ${request.url ?? ''}`)
      if (request.url === '/api/events.mux') {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.write(': connected\n\n')
        response.write(`data: ${JSON.stringify({
          type: 'server-request',
          rpcId: 'rpc-1',
          method: 'approval/requested',
          payload: { type: 'approval/requested', sessionId: 'session-1', approvalId: 'approval-1' },
        })}\n\n`)
        return
      }
      const chunks: Buffer[] = []
      request.on('data', (chunk) => { chunks.push(chunk as Buffer) })
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { rpcId: string; method: string }
        if (request.url === '/api/respond') {
          response.end(JSON.stringify({ accepted: true }))
          return
        }
        response.end(JSON.stringify({
          type: 'server-response',
          rpcId: body.rpcId,
          result: { ok: true, value: { method: body.method } },
        }))
      })
    })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('expected TCP address')
    const rpc = createDesktopHostRpc(`http://127.0.0.1:${String(address.port)}/`)
    try {
      await expect(rpc.call('session.list', {})).resolves.toEqual({
        ok: true,
        value: { method: 'session.list' },
      })
      await expect(rpc.respond('rpc-1', { outcome: 'allowed-once' })).resolves.toEqual({ accepted: true })
      const frame = await new Promise<{ rpcId: string; payload: Record<string, unknown> }>((resolve) => {
        const stop = rpc.subscribeMux((next) => {
          stop()
          resolve(next)
        })
      })
      expect(frame).toEqual({
        rpcId: 'rpc-1',
        payload: { type: 'approval/requested', sessionId: 'session-1', approvalId: 'approval-1' },
      })
      expect(seen).toContain('POST /api/session.list')
      expect(seen).toContain('POST /api/respond')
      expect(seen).toContain('GET /api/events.mux')
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve()
          else reject(error)
        })
      })
    }
  })
})
