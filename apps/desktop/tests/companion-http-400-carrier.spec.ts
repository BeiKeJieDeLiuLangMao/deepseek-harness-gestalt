/** Companion codec coverage for an external HTTP carrier status failure. */

import { createServer, request, type Server } from 'node:http'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import {
  createCompanionNegotiationChannel,
  createCompanionVersionOffer,
  decodeCompanionMessage,
  encodeCompanionMessage,
  negotiateCompanionProtocol,
  parseCompanionOperationId,
  REMOTE_PROTOCOL_LIMITS,
} from '@deepseek-ai/dsh-remote-protocol'
import type { RunningWebHost } from '../src/spawn-web-host.ts'
import { bootstrapDesktopHostCookie } from '../src/host-rpc.ts'
import {
  generateDesktopHostTypertArtifacts, startShippedWebHost, stopShippedWebHosts,
} from './shipped-web-host.ts'

const children: RunningWebHost[] = []
const homes: string[] = []
const uninstalls: Array<() => void> = []
const proxies: Server[] = []
let runHost400CodecProbe: typeof import('./host-400-codec-probe.ts').runHost400CodecProbe
let DesktopCompanionProductOwner: typeof import('../src/companion-product.ts').DesktopCompanionProductOwner

beforeAll(async () => {
  generateDesktopHostTypertArtifacts()
  ;({ runHost400CodecProbe } = await import('./host-400-codec-probe.ts'))
  ;({ DesktopCompanionProductOwner } = await import('../src/companion-product.ts'))
}, 120_000)

afterEach(async () => {
  try {
    for (const uninstall of uninstalls.splice(0).reverse()) uninstall()
    for (const proxy of proxies.splice(0).reverse()) await closeServer(proxy)
  } finally {
    await stopShippedWebHosts(children, homes)
  }
})

describe('Companion external HTTP carrier failure codec', () => {
  it('decodes one real TCP HTTP 400 with its exact operation and failure', async () => {
    const encoded = await runHost400CodecProbe()
    const protocol = negotiateCompanionProtocol(
      createCompanionNegotiationChannel(),
      createCompanionVersionOffer('mobile'),
      createCompanionVersionOffer('desktop'),
    )
    expect(decodeCompanionMessage(protocol, encoded)).toEqual({
      type: 'result',
      result: {
        type: 'operation-failed',
        operationId: 'visible-host-400',
        failure: {
          kind: 'http', code: 'HOST_HTTP_STATUS',
          message: 'Desktop Host returned HTTP 400', status: 400,
        },
      },
    })
  })

  it('encodes a shipped Host 400 from one corrupted transport request', async () => {
    const host = await startShippedWebHost({ children, homes })
    const cookie = await bootstrapDesktopHostCookie(host.running.launchUrl, host.running.url)
    let mutationCount = 0
    let observed: { originalMethod?: string; originalPath?: string; mutatedMethod?: string; mutatedPath?: string } = {}
    let upstreamStatus: number | undefined
    const proxy = createServer((incoming, outgoing) => {
      const target = incoming.method === 'POST' && incoming.url === '/api/session/search'
      const upstreamUrl = new URL(host.running.url)
      const headers = { ...incoming.headers }
      if (target) {
        mutationCount += 1
        observed = {
          originalMethod: incoming.method, originalPath: incoming.url,
          mutatedMethod: 'GET', mutatedPath: '/%zz',
        }
        delete headers['content-length']
        delete headers['content-type']
      }
      const forwarded = request({
        hostname: '127.0.0.1', port: upstreamUrl.port,
        method: target ? 'GET' : incoming.method,
        path: target ? '/%zz' : incoming.url,
        headers,
      }, (response) => {
        if (target) upstreamStatus = response.statusCode
        outgoing.writeHead(response.statusCode ?? 500, response.headers)
        response.pipe(outgoing)
      })
      if (target) {
        incoming.resume()
        forwarded.end()
      } else {
        incoming.pipe(forwarded)
      }
      forwarded.on('error', (error) => { outgoing.destroy(error) })
    })
    proxies.push(proxy)
    await new Promise<void>((resolve, reject) => {
      proxy.once('error', reject)
      proxy.listen(0, '127.0.0.1', resolve)
    })
    const address = proxy.address()
    if (address === null || typeof address === 'string') throw new Error('corrupting proxy has no port')
    const owner = new DesktopCompanionProductOwner({
      timeoutMs: 15_000, responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    })
    uninstalls.push(owner.installHost(`http://127.0.0.1:${String(address.port)}`, cookie))
    const operationId = parseCompanionOperationId('corrupted-transport-http-400')
    const result = await owner.handle({
      type: 'search-sessions', operationId, query: 'corrupt only this RPC request',
    }, {
      pairingId: parsePersonalPairingId('corrupted-transport-pairing'),
      attachmentKey: new Uint8Array(32), now: Date.now,
      generation: 1, desktopRevision: 1, desktopName: 'Assembled Desktop',
      downloadAttachment: () => Promise.reject(new Error('search must not download')),
      submitAttachment: () => Promise.reject(new Error('search must not submit')),
      resolveInteraction: () => undefined, pendingInteractions: () => [],
    })
    expect(mutationCount).toBe(1)
    expect(observed).toEqual({
      originalMethod: 'POST', originalPath: '/api/session/search',
      mutatedMethod: 'GET', mutatedPath: '/%zz',
    })
    expect(upstreamStatus).toBe(400)
    expect(result).toEqual({
      type: 'operation-failed', operationId,
      failure: {
        kind: 'http', code: 'HOST_HTTP_STATUS',
        message: 'Desktop Host returned HTTP 400', status: 400,
      },
    })
    const protocol = negotiateCompanionProtocol(
      createCompanionNegotiationChannel(),
      createCompanionVersionOffer('mobile'),
      createCompanionVersionOffer('desktop'),
    )
    expect(decodeCompanionMessage(protocol, encodeCompanionMessage(protocol, {
      type: 'result', result,
    }))).toEqual({ type: 'result', result })
  }, 180_000)
})

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => {
    server.close((error) => { if (error === undefined) resolve(); else reject(error) })
  })
}
