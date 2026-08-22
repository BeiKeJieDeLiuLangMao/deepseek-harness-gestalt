import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createDesktopHostRpc } from '../src/host-rpc.ts'

const closeServers: Array<() => Promise<void>> = []

afterEach(async () => { await Promise.all(closeServers.splice(0).map(close => close())) })

describe('Desktop Host RPC', () => {
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
    const rpc = createDesktopHostRpc(`http://127.0.0.1:${String(address.port)}`, { timeoutMs: 25 })

    await expect(rpc.call('session.search', { query: 'ok' })).resolves.toMatchObject({
      ok: true,
      value: { items: [], hasMore: false },
    })
    await expect(rpc.call('session.search', { query: 'http-400' })).resolves.toEqual({
      ok: false,
      failure: { kind: 'http', code: 'HOST_HTTP_STATUS', message: 'Desktop Host returned HTTP 400', status: 400 },
    })
    await expect(rpc.call('session.search', { query: 'wire-invalid' })).resolves.toEqual({
      ok: false,
      failure: { kind: 'wire', code: 'HOST_WIRE_INVALID', message: 'Desktop Host response was not valid RPC JSON' },
    })
    await expect(rpc.call('session.search', { query: 'business' })).resolves.toEqual({
      ok: false,
      failure: { kind: 'business', code: 'bad-request', message: 'invalid search query' },
    })
    await expect(rpc.call('session.search', { query: 'timeout' })).resolves.toEqual({
      ok: false,
      failure: { kind: 'timeout', code: 'HOST_TIMEOUT', message: 'Desktop Host request timed out' },
    })
    const deadlineRpc = createDesktopHostRpc(`http://127.0.0.1:${String(address.port)}`, { timeoutMs: 50 })
    await expect(deadlineRpc.call('session.search', { query: 'slow-chunks' })).resolves.toEqual({
      ok: false,
      failure: { kind: 'timeout', code: 'HOST_TIMEOUT', message: 'Desktop Host request timed out' },
    })
  })
})
