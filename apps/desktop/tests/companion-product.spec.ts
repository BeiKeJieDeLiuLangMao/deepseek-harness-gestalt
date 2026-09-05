import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import { parsePersonalPairingId } from '@deepseek-ai/dsh-remote-access'
import {
  deriveCompanionAttachmentKey,
  encodeProtocolBase64Url,
  parseCompanionOperationId,
  parseCompanionInteractionId,
  parseCompanionSessionId,
  parseDocumentTransferId,
  parseMemberQuestionId,
  REMOTE_PROTOCOL_LIMITS,
  sealCompanionAttachment,
  type CompanionOfferAttachmentOperation,
  type CompanionSearchSessionsOperation,
  type CompanionOperation,
} from '@deepseek-ai/dsh-remote-protocol'
import {
  DesktopCompanionOperationLedger,
} from '../src/companion-operation-ledger.ts'
import {
  DesktopCompanionSurfaceDiscovery,
  DesktopCompanionProductOwner,
  DesktopSessionHistoryCache,
  handleCompanionProductOperation,
} from '../src/companion-product.ts'
import type { DesktopHostRpc, DesktopHostRpcResult } from '../src/host-rpc.ts'

const pairingId = parsePersonalPairingId('pairing-product')
const attachmentKey = crypto.getRandomValues(new Uint8Array(32))
const sessionId = parseCompanionSessionId('session-product')
const closeServers: Array<() => Promise<void>> = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(closeServers.splice(0).map(close => close()))
}, 15_000)

describe('Desktop Companion product operations', () => {
  it('leases Host event streams only while authenticated live connections exist', async () => {
    const upgrades: string[] = []
    const server = createServer()
    const wss = new WebSocketServer({ noServer: true })
    server.on('upgrade', (request, socket, head) => {
      upgrades.push(request.url ?? '')
      wss.handleUpgrade(request, socket, head, (websocket) => {
        websocket.on('message', (data) => {
          const text = typeof data === 'string' ? data : Buffer.from(data as Uint8Array).toString('utf8')
          const message = JSON.parse(text) as { type?: string; streamId?: string; endpoint?: string }
          if (message.type === 'open' && message.endpoint === 'workspace/follow' && message.streamId !== undefined) {
            websocket.send(JSON.stringify({
              type: 'item',
              streamId: message.streamId,
              value: { type: 'baseline', value: { items: [], archivedSessionIds: [] } },
            }))
          }
          if (message.type === 'open' && message.endpoint === '$events' && message.streamId !== undefined) {
            websocket.send(JSON.stringify({
              type: 'item',
              streamId: message.streamId,
              value: { type: 'ready', clientId: 'client-loopback', host: { home: '/tmp' } },
            }))
          }
        })
      })
    })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    closeServers.push(async () => {
      for (const client of wss.clients) client.terminate()
      wss.close()
      server.close()
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('expected TCP address')
    const owner = new DesktopCompanionProductOwner({
      timeoutMs: 100, responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    })
    const uninstall = owner.installHost(`http://127.0.0.1:${String(address.port)}`)
    await expect.poll(() => upgrades.filter(path => path === '/api/remote.mux').length).toBeGreaterThan(0)
    expect(upgrades.some(path => path.startsWith('/api/events.'))).toBe(false)
    const first = owner.connectLiveProjection(pairingId, () => {}, () => {})
    const second = owner.connectLiveProjection(pairingId, () => {}, () => {})
    expect(upgrades.some(path => path.startsWith('/api/events.'))).toBe(false)
    first()
    second()
    uninstall()
  })

  it('requests a complete Mobile resync when the Web Host arrives after Relay authentication', async () => {
    const loopback = await listenCompanionHost()
    const owner = new DesktopCompanionProductOwner({
      timeoutMs: 100, responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    })
    const changed = vi.fn()
    const disconnect = owner.connectLiveProjection(pairingId, changed, () => {})
    const uninstall = owner.installHost(loopback.origin)
    expect(changed).toHaveBeenCalledOnce()
    expect(changed).toHaveBeenCalledWith({ type: 'surface' })
    disconnect()
    uninstall()
  })

  it('invalidates Companion list from $events api-session notices without polling', async () => {
    const loopback = await listenCompanionHost({
      onEventsOpen: (send) => {
        send({
          type: 'emit',
          event: 'api-session/added',
          args: [{ sessionId: 'session-added', updatedAt: 1, running: false, blank: true }],
        })
        send({
          type: 'emit',
          event: 'api-session/status',
          args: ['session-running', true],
        })
        send({
          type: 'emit',
          event: 'api-session/removed',
          args: ['session-added'],
        })
      },
    })
    const owner = new DesktopCompanionProductOwner({
      timeoutMs: 2_000, responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    })
    const changes: unknown[] = []
    const disconnect = owner.connectLiveProjection(pairingId, (change) => { changes.push(change) }, () => {})
    const uninstall = owner.installHost(loopback.origin)
    await expect.poll(() => changes.filter(change => isRecord(change) && change.type === 'surface').length >= 3).toBe(true)
    await expect.poll(() => changes.some((change) => {
      return isRecord(change) && change.type === 'session' && change.sessionId === 'session-running'
    })).toBe(true)
    disconnect()
    uninstall()
  })

  it('projects a bounded real Host Session and Workspace surface', async () => {
    const calls: string[] = []
    const dependencies = baseDependencies(hostRpc(async (method) => {
      calls.push(method)
      if (method === 'session.list') return { ok: true, value: { items: [{
        sessionId: 'session-product', updatedAt: 9, running: false, blank: false,
        cwd: '/work', projections: { asOfSeq: 1, values: { title: 'Real session' } },
      }, {
        sessionId: 'session-archived', updatedAt: 10, running: false, blank: false,
      }] } }
      throw new Error(`unexpected Host method ${method}`)
    }), {
      items: [{
        workspaceId: 'workspace-product', path: '/work', title: 'Work',
        sessionIds: ['session-product'], createdAt: '2026-08-23T00:00:00.000Z',
        updatedAt: '2026-08-23T00:00:00.000Z',
      }], archivedSessionIds: ['session-archived'],
    })
    const operation = op({ type: 'refresh-surface', offset: 0 })
    await expect(handleCompanionProductOperation(operation, dependencies)).resolves.toMatchObject({
      type: 'surface-snapshot', operationId: operation.operationId,
      offset: 0,
      sessions: [{ sessionId, displayTitle: 'Real session', cwd: '/work' }],
      workspaces: [{ workspaceId: 'workspace-product', sessionIds: [sessionId] }],
    })
    expect(calls).toEqual(['session.list'])
  })

  it('does not reuse a follow snapshot when maxMessages changes', async () => {
    const follows: Array<number | undefined> = []
    const pages: Array<{ throughSeq: number; beforeSeq?: number; maxMessages?: number }> = []
    const generation = new AbortController()
    const rpc: DesktopHostRpc = {
      followEvents: async () => {},
      completeEvent: async () => ({ ok: true, value: undefined }),
      call: async (method, payload) => {
        expect(method).toBe('session/page')
        const request = (payload as { args: { request: {
          throughSeq: number
          beforeSeq?: number
          maxMessages?: number
        } } }).args.request
        pages.push(request)
        return { ok: true, value: { records: [], hasMore: false } }
      },
      followWorkspaces: async () => {},
      followSession: async (sessionId, signal, accept, maxMessages) => {
        follows.push(maxMessages)
        if (sessionId === 'session-other') {
          await new Promise<void>((resolve) => {
            if (signal.aborted) resolve()
            else signal.addEventListener('abort', () => resolve(), { once: true })
          })
          return
        }
        accept(sessionFollowSnapshot({
          cursor: maxMessages === 1 ? 0 : 10,
          hasMore: maxMessages === 1,
          records: [{
            type: 'event',
            event: {
              type: 'user/message',
              seq: maxMessages === 1 ? 0 : 10,
              time: 1,
              data: { content: [{ type: 'text', text: String(maxMessages) }], source: { kind: 'user' } },
              ...maxMessages === 20 ? { sourceEventSeqs: [8, 9] } : {},
            },
          }],
        }))
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve()
          else signal.addEventListener('abort', () => resolve(), { once: true })
        })
      },
    }
    const cache = new DesktopSessionHistoryCache(rpc, generation.signal)
    const first = await cache.page('session-product', { maxMessages: 1 })
    const second = await cache.page('session-product', { maxMessages: 20 })
    expect(follows).toEqual([1, 20])
    expect(first).toMatchObject({
      ok: true, value: { events: [{ event: { seq: 0, data: { content: [{ text: '1' }] } } }], hasMore: true },
    })
    expect(second).toMatchObject({
      ok: true,
      value: { events: [{ event: { seq: 10, sourceEventSeqs: [8, 9] } }], hasMore: false },
    })
    await cache.page('session-product', { beforeSeq: 0, maxMessages: 1 })
    await cache.page('session-product', { beforeSeq: 10, maxMessages: 20 })
    expect(pages).toEqual([
      {
        address: { kind: 'session', sessionId: 'session-product' },
        throughSeq: 0, beforeSeq: 0, maxMessages: 1,
      },
      {
        address: { kind: 'session', sessionId: 'session-product' },
        throughSeq: 10, beforeSeq: 10, maxMessages: 20,
      },
    ])
    const cancelled = new AbortController()
    const pending = cache.page('session-other', { maxMessages: 5 }, cancelled.signal)
    cancelled.abort()
    await expect(pending).resolves.toMatchObject({
      ok: false, failure: { code: 'HOST_WIRE_INVALID' },
    })
    expect(follows).toEqual([1, 20, 5])
    generation.abort()
    await expect(cache.page('session-product', { maxMessages: 20 })).resolves.toMatchObject({
      ok: false, failure: { code: 'HOST_WIRE_INVALID' },
    })
  })

  it('fails closed when a session follow snapshot is invalid and keeps packed neighbors intact', async () => {
    const generation = new AbortController()
    let invalidAccepts = 0
    const rpc: DesktopHostRpc = {
      followEvents: async () => {},
      completeEvent: async () => ({ ok: true, value: undefined }),
      call: async () => {
        throw new Error('invalid follow must not page')
      },
      followWorkspaces: async () => {},
      followSession: async (sessionId, signal, accept, maxMessages) => {
        if (sessionId === 'session-invalid') {
          invalidAccepts += 1
          accept({ type: 'snapshot', records: 'not-an-array' })
          await new Promise<void>((resolve) => {
            if (signal.aborted) resolve()
            else signal.addEventListener('abort', () => resolve(), { once: true })
          })
          return
        }
        accept(sessionFollowSnapshot({
          cursor: 14,
          hasMore: false,
          records: [
            {
              type: 'chunks',
              event: {
                type: 'chunkrow/text-chunks',
                seq: 11,
                time: 20,
                data: { turn: 1, step: 2, index: 0, dt: [1, 2], texts: ['a', 'b', 'c'] },
              },
            },
            {
              type: 'event',
              event: {
                type: 'assistant/message',
                seq: 14,
                time: 30,
                data: { turn: 1, step: 2 },
                sourceEventSeqs: [11, 12, 13],
              },
            },
          ],
        }))
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve()
          else signal.addEventListener('abort', () => resolve(), { once: true })
        })
        void maxMessages
      },
    }
    const cache = new DesktopSessionHistoryCache(rpc, generation.signal)
    await expect(cache.page('session-invalid', { maxMessages: 2 })).resolves.toMatchObject({
      ok: false, failure: { kind: 'wire', code: 'HOST_WIRE_INVALID' },
    })
    expect(invalidAccepts).toBe(1)
    const packed = await cache.page('session-packed', { maxMessages: 20 })
    expect(packed).toMatchObject({
      ok: true,
      value: {
        events: [
          { event: { type: 'assistant/chunk', seq: 11 } },
          { event: { type: 'assistant/chunk', seq: 12 } },
          { event: { type: 'assistant/chunk', seq: 13 } },
          { event: { type: 'assistant/message', seq: 14, sourceEventSeqs: [11, 12, 13] } },
        ],
        hasMore: false,
      },
    })
    generation.abort()
  })

  it('rejects surface and search while the workspace follow snapshot is still loading', async () => {
    const dependencies = baseDependencies(hostRpc(async (method) => {
      if (method === 'session.list') return { ok: true, value: { items: [{
        sessionId: 'session-product', updatedAt: 9, running: false, blank: false,
      }] } }
      if (method === 'session.search') return { ok: true, value: { items: [
        { sessionId: 'session-hit', snippet: 'needle' },
      ], hasMore: false } }
      throw new Error(`unexpected Host method ${method}`)
    }))
    dependencies.workspaceSnapshot = async () => ({ kind: 'loading' })
    await expect(handleCompanionProductOperation(op({ type: 'refresh-surface', offset: 0 }), dependencies))
      .resolves.toMatchObject({
        type: 'operation-failed',
        failure: { kind: 'timeout', code: 'HOST_TIMEOUT' },
      })
    await expect(handleCompanionProductOperation(search('needle'), dependencies)).resolves.toMatchObject({
      type: 'operation-failed',
      failure: { kind: 'timeout', code: 'HOST_TIMEOUT' },
    })
  })

  it('does not reuse a workspace snapshot after the follow stream fails', async () => {
    const dependencies = baseDependencies(hostRpc(async (method) => {
      if (method === 'session.search') return { ok: true, value: { items: [
        { sessionId: 'session-hit', snippet: 'needle' },
      ], hasMore: false } }
      throw new Error(`unexpected Host method ${method}`)
    }), { items: [], archivedSessionIds: [] })
    await expect(handleCompanionProductOperation(search('needle'), dependencies)).resolves.toMatchObject({
      type: 'session-search', items: [{ sessionId: 'session-hit' }],
    })
    dependencies.workspaceSnapshot = async () => ({ kind: 'error', message: 'Desktop Host workspace follow ended' })
    await expect(handleCompanionProductOperation(search('needle'), dependencies)).resolves.toMatchObject({
      type: 'operation-failed',
      failure: { kind: 'wire', code: 'HOST_WIRE_INVALID', message: 'Desktop Host workspace follow ended' },
    })
  })

  it('rejects surface and search after a workspace follow frame fails the generated codec', async () => {
    const loopback = await listenCompanionHost({
      workspaceFollowValue: { type: 'baseline', value: { items: 'not-an-array' } },
    })
    const owner = new DesktopCompanionProductOwner({
      timeoutMs: 2_000, responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    })
    const uninstall = owner.installHost(loopback.origin)
    const pairing = baseDependencies(hostRpc(async () => {
      throw new Error('owner must use its installed Host RPC')
    }))
    await expect(owner.handle(op({ type: 'refresh-surface', offset: 0 }), pairing)).resolves.toMatchObject({
      type: 'operation-failed',
      failure: { kind: 'wire', code: 'HOST_WIRE_INVALID' },
    })
    await expect(owner.handle(search('needle'), pairing)).resolves.toMatchObject({
      type: 'operation-failed',
      failure: { kind: 'wire', code: 'HOST_WIRE_INVALID' },
    })
    uninstall()
  })

  it('projects a later Session page with exact hasMore and Workspace membership', async () => {
    let items = Array.from({ length: REMOTE_PROTOCOL_LIMITS.surfaceSessionRows + 1 }, (_, index) => ({
      sessionId: `session-${String(index)}`,
      updatedAt: index,
      running: false,
      blank: false,
    }))
    let sessionListCalls = 0
    const workspaceSnapshot = () => Promise.resolve({
      items: items.map((item, index) => ({
        workspaceId: `workspace-${String(index)}`, path: `/work/${String(index)}`, title: `Work ${String(index)}`,
        sessionIds: [item.sessionId],
        createdAt: '2026-08-23T00:00:00.000Z', updatedAt: '2026-08-23T00:00:00.000Z',
      })),
      archivedSessionIds: [],
    })
    const dependencies = baseDependencies(hostRpc(async (method) => {
      if (method === 'session.list') {
        sessionListCalls += 1
        return { ok: true, value: { items } }
      }
      throw new Error(`unexpected Host method ${method}`)
    }))
    dependencies.workspaceSnapshot = workspaceSnapshot
    const discovery = new DesktopCompanionSurfaceDiscovery()
    await expect(discovery.refresh(op({ type: 'refresh-surface', offset: 0 }), dependencies)).resolves.toMatchObject({
      offset: 0,
      hasMore: true,
    })
    items = [{ sessionId: 'session-new', updatedAt: 100, running: false, blank: false }, ...items]
    const operation = {
      ...op({ type: 'refresh-surface', offset: REMOTE_PROTOCOL_LIMITS.surfaceSessionRows }),
      operationId: parseCompanionOperationId('operation-refresh-surface-page-two'),
    }

    await expect(discovery.refresh(operation, {
      ...dependencies,
      desktopRevision: dependencies.desktopRevision + 2,
    })).resolves.toMatchObject({
      type: 'surface-snapshot',
      offset: REMOTE_PROTOCOL_LIMITS.surfaceSessionRows,
      hasMore: false,
      sessions: [{ sessionId: `session-${String(REMOTE_PROTOCOL_LIMITS.surfaceSessionRows)}` }],
      workspaces: [{
        workspaceId: `workspace-${String(REMOTE_PROTOCOL_LIMITS.surfaceSessionRows)}`,
        sessionIds: [`session-${String(REMOTE_PROTOCOL_LIMITS.surfaceSessionRows)}`],
      }],
    })
    expect(sessionListCalls).toBe(1)
  })

  it('pages a large surface by its encoded projection byte limit without skipping Sessions', async () => {
    const items = Array.from({ length: REMOTE_PROTOCOL_LIMITS.surfaceSessionRows }, (_, index) => ({
      sessionId: `session-large-${String(index)}`,
      updatedAt: index,
      running: false,
      blank: false,
      projections: { values: { title: `${String(index)}-${'large title '.repeat(300)}` } },
    }))
    const dependencies = baseDependencies(hostRpc(async method => method === 'session.list'
      ? { ok: true, value: { items } }
      : { ok: true, value: { items: [], archivedSessionIds: [] } }))
    const discovery = new DesktopCompanionSurfaceDiscovery()
    const first = await discovery.refresh(op({ type: 'refresh-surface', offset: 0 }), dependencies)

    expect(first.type).toBe('surface-snapshot')
    if (first.type !== 'surface-snapshot') throw new Error('expected first surface page')
    expect(first.sessions.length).toBeGreaterThan(0)
    expect(first.sessions.length).toBeLessThan(items.length)
    expect(first.hasMore).toBe(true)
    expect(new TextEncoder().encode(JSON.stringify({
      applicationVersion: 4,
      type: 'projection',
      projection: { ...first, desktopRevision: Number.MAX_SAFE_INTEGER },
    })).byteLength).toBeLessThanOrEqual(REMOTE_PROTOCOL_LIMITS.transcriptPageBytes)

    const second = await discovery.refresh({
      ...op({ type: 'refresh-surface', offset: first.sessions.length }),
      operationId: parseCompanionOperationId('operation-large-surface-page-two'),
    }, dependencies)
    expect(second.type).toBe('surface-snapshot')
    if (second.type !== 'surface-snapshot') throw new Error('expected second surface page')
    expect([...first.sessions, ...second.sessions].map(session => session.sessionId)).toEqual(
      items.map(item => item.sessionId),
    )
    expect(second.hasMore).toBe(false)
  })

  it('returns a bounded failure when one surface row exceeds the projection byte limit', async () => {
    const dependencies = baseDependencies(hostRpc(async method => method === 'session.list'
      ? { ok: true, value: { items: [{
        sessionId: 'session-oversized',
        updatedAt: 1,
        running: false,
        blank: false,
        projections: { values: { title: 'oversized'.repeat(6_000) } },
      }] } }
      : { ok: true, value: { items: [], archivedSessionIds: [] } }))

    await expect(new DesktopCompanionSurfaceDiscovery().refresh(
      op({ type: 'refresh-surface', offset: 0 }),
      dependencies,
    )).resolves.toMatchObject({
      type: 'operation-failed',
      failure: { code: 'HOST_WIRE_INVALID' },
    })
  })

  it('rejects an offset-zero snapshot that returns after Host replacement', async () => {
    const oldSessions = deferred<DesktopHostRpcResult>()
    const oldWorkspaces = deferred<DesktopHostRpcResult>()
    const discovery = new DesktopCompanionSurfaceDiscovery()
    const oldDependencies = baseDependencies(hostRpc(async method => await (
      method === 'session.list' ? oldSessions.promise : oldWorkspaces.promise
    )))
    const old = discovery.refresh(op({ type: 'refresh-surface', offset: 0 }), oldDependencies)

    discovery.clear()
    const items = Array.from({ length: REMOTE_PROTOCOL_LIMITS.surfaceSessionRows + 1 }, (_, index) => ({
      sessionId: `replacement-${String(index)}`, updatedAt: index, running: false, blank: false,
    }))
    const replacementDependencies = baseDependencies(hostRpc(async method => method === 'session.list'
      ? { ok: true, value: { items } }
      : { ok: true, value: { items: [], archivedSessionIds: [] } }))
    await discovery.refresh({
      ...op({ type: 'refresh-surface', offset: 0 }),
      operationId: parseCompanionOperationId('replacement-page-zero'),
    }, replacementDependencies)
    oldSessions.resolve({ ok: true, value: { items: [{
      sessionId: 'old-host-session', updatedAt: 1, running: false, blank: false,
    }] } })
    oldWorkspaces.resolve({ ok: true, value: { items: [], archivedSessionIds: [] } })

    await expect(old).resolves.toMatchObject({
      type: 'operation-failed',
      failure: { code: 'HOST_WIRE_INVALID' },
    })
    await expect(discovery.refresh({
      ...op({ type: 'refresh-surface', offset: REMOTE_PROTOCOL_LIMITS.surfaceSessionRows }),
      operationId: parseCompanionOperationId('replacement-page-one'),
    }, replacementDependencies)).resolves.toMatchObject({
      type: 'surface-snapshot',
      sessions: [{ sessionId: `replacement-${String(REMOTE_PROTOCOL_LIMITS.surfaceSessionRows)}` }],
    })
  })

  it('projects Host history into the shared conversation carrier', async () => {
    const dependencies = baseDependencies(hostRpc(async (method) => {
      expect(method).toBe('session.list')
      return { ok: true, value: { items: [{
        sessionId: 'session-product', updatedAt: 30, running: true, blank: false,
      }] } }
    }))
    dependencies.sessionHistory = historyCache([
      { event: { type: 'user/message', seq: 1, time: 10, data: {
        id: 'message-user', content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' },
      } } },
      { event: { type: 'assistant/message', seq: 2, time: 20, data: {
        turn: 1, step: 1, message: {
          id: 'message-assistant', role: 'assistant', content: [{ type: 'text', text: 'world' }],
          source: { kind: 'assistant' },
        },
      } } },
      { event: { type: 'user/message', seq: 3, time: 25, data: {
        id: 'message-steering', content: [{ type: 'text', text: 'redirect' }],
        source: { kind: 'steering' },
      } } },
      { event: { type: 'turn/end', seq: 4, time: 30, data: {
        turn: 1, reason: { kind: 'error', error: { message: 'model failed', code: 'MODEL_FAILED' } },
      } } },
    ])
    const operation = op({ type: 'load-history', sessionId, beforeSeq: 10, maxMessages: 20 })
    await expect(handleCompanionProductOperation(operation, dependencies)).resolves.toMatchObject({
      type: 'conversation-snapshot', operationId: operation.operationId, sessionId, beforeSeq: 10,
      conversation: {
        nodes: [
          { kind: 'user', seq: 1, content: [{ type: 'text', text: 'hello' }] },
          { kind: 'assistant', seq: 2, blocks: [{ kind: 'text', text: 'world' }] },
          { kind: 'steering', seq: 3, content: [{ type: 'text', text: 'redirect' }] },
          { kind: 'turn-error', seq: 4, message: 'model failed', code: 'MODEL_FAILED' },
        ],
        running: true,
        hasMore: false,
      },
    })
  })

  it('projects non-user messages with the shared context presentation metadata', async () => {
    const dependencies = baseDependencies(hostRpc(async (method) => {
      if (method === 'session.list') return { ok: true, value: { items: [{
        sessionId: 'session-product', updatedAt: 30, running: false, blank: false,
      }] } }
      throw new Error(`unexpected Host method ${method}`)
    }))
    dependencies.sessionHistory = historyCache([{ event: { type: 'user/message', seq: 1, time: 10, data: {
      id: 'message-context', content: [{ type: 'text', text: 'Current runtime context.' }],
      source: { kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt', form: 'snapshot' },
    } } }])
    const operation = op({ type: 'load-history', sessionId, maxMessages: 20 })

    await expect(handleCompanionProductOperation(operation, dependencies)).resolves.toMatchObject({
      type: 'conversation-snapshot',
      conversation: { nodes: [{
        kind: 'context', seq: 1, content: [{ type: 'text', text: 'Current runtime context.' }],
        source: { kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt', form: 'snapshot' },
        provenance: { role: 'inject', label: '@deepseek-ai/dsh-system-prompt' },
        form: 'snapshot',
      }] },
    })
  })

  it('unwraps Host tool presentation envelopes for the shared Mobile cards', async () => {
    const dependencies = baseDependencies(hostRpc(async (method) => {
      if (method === 'session.list') return { ok: true, value: { items: [{
        sessionId: 'session-product', updatedAt: 30, running: false, blank: false,
      }] } }
      throw new Error(`unexpected Host method ${method}`)
    }))
    dependencies.sessionHistory = historyCache([
      { event: { type: 'tool/call', seq: 1, time: 10, data: {
        turn: 1, step: 1, callId: 'call-1', name: 'bash', arguments: '{"command":"pwd"}',
      } }, view: { for: 'call', view: { card: 'terminal', title: 'Run command', cwd: '/tmp' } } },
      { event: { type: 'tool/result', seq: 2, time: 20, data: {
        turn: 1, step: 1,
        message: { source: { kind: 'tool', callId: 'call-1' }, content: [{ type: 'text', text: '/tmp' }] },
      } }, view: { for: 'result', view: { card: 'terminal', title: 'Command result', output: '/tmp', exitCode: 0 } } },
    ])
    const operation = op({ type: 'load-history', sessionId, maxMessages: 20 })

    await expect(handleCompanionProductOperation(operation, dependencies)).resolves.toMatchObject({
      type: 'conversation-snapshot',
      conversation: { nodes: [{
        kind: 'tool-result', callId: 'call-1',
        callView: { card: 'terminal', title: 'Run command', cwd: '/tmp' },
        resultView: { card: 'terminal', title: 'Command result', output: '/tmp', exitCode: 0 },
      }] },
    })
  })

  it('projects an empty Session with the shared blank composer phase', async () => {
    const dependencies = baseDependencies(hostRpc(async (method) => {
      if (method === 'session.list') return { ok: true, value: { items: [{
        sessionId: 'session-product', updatedAt: 30, running: false, blank: true,
      }] } }
      throw new Error(`unexpected Host method ${method}`)
    }))
    dependencies.sessionHistory = historyCache([])
    const operation = op({ type: 'load-history', sessionId, maxMessages: 20 })

    await expect(handleCompanionProductOperation(operation, dependencies)).resolves.toMatchObject({
      type: 'conversation-snapshot',
      conversation: { composerPhase: 'blank', blank: true },
    })
  })

  it('loads an authoritative search hit beyond the bounded surface baseline', async () => {
    const target = parseCompanionSessionId('session-beyond-baseline')
    const items = Array.from(
      { length: REMOTE_PROTOCOL_LIMITS.surfaceSessionRows },
      (_, index) => ({
        sessionId: `session-visible-${String(index)}`,
        updatedAt: index,
        running: false,
        blank: false,
      }),
    )
    items.push({ sessionId: target, updatedAt: 100, running: true, blank: false })
    const dependencies = baseDependencies(hostRpc(async (method) => {
      if (method === 'session.list') return { ok: true, value: { items } }
      throw new Error(`unexpected Host method ${method}`)
    }))
    dependencies.sessionHistory = historyCache([])
    const operation = op({ type: 'load-history', sessionId: target, maxMessages: 20 })

    await expect(handleCompanionProductOperation(operation, dependencies)).resolves.toMatchObject({
      type: 'conversation-snapshot',
      sessionId: target,
      conversation: { running: true },
    })
  })

  it('projects model retries and suppresses the retry-owned terminal turn error', async () => {
    const dependencies = baseDependencies(hostRpc(async (method) => {
      if (method === 'session.list') return { ok: true, value: { items: [{
        sessionId: 'session-product', updatedAt: 50, running: false, blank: false,
      }] } }
      throw new Error(`unexpected Host method ${method}`)
    }))
    dependencies.sessionHistory = historyCache([
      { event: { type: 'step/start', seq: 1, time: 10, data: { turn: 1, step: 1 } } },
      { event: { type: 'turn/end', seq: 2, time: 20, data: {
        turn: 1, reason: { kind: 'error', error: { message: 'temporary', code: 'RATE_LIMIT' } },
      } } },
      { event: { type: 'llm/retry', seq: 3, time: 30, data: {
        retryId: 'retry-product', turn: 1, step: 1, provider: 'deepseek', mode: 'normal',
        policyKey: 'normal', retry: 1, maxRetries: 2, delayMs: 500,
        failure: { message: 'temporary', code: 'RATE_LIMIT' },
      } } },
      { event: { type: 'llm/retry-started', seq: 4, time: 40, data: {
        retryId: 'retry-product', turn: 1, step: 1, retry: 1,
      } } },
    ])
    const operation = op({ type: 'load-history', sessionId, maxMessages: 20 })

    await expect(handleCompanionProductOperation(operation, dependencies)).resolves.toMatchObject({
      type: 'conversation-snapshot',
      conversation: {
        nodes: [{
          kind: 'model-retry', seq: 3, retryId: 'retry-product', retryState: 'started',
          failure: { message: 'temporary', code: 'RATE_LIMIT' },
        }],
      },
    })
  })

  it('submits and cancels through exact Host methods with correlated receipts', async () => {
    const calls: Array<[string, Record<string, unknown>]> = []
    const dependencies = baseDependencies(hostRpc(async (method, payload) => {
      calls.push([method, payload])
      return { ok: true, value: { accepted: true } }
    }))
    const submit = op({ type: 'submit-prompt', sessionId, text: 'continue' })
    const cancel = op({ type: 'cancel-session', sessionId })
    await expect(handleCompanionProductOperation(submit, dependencies)).resolves.toMatchObject({
      type: 'confirmed', operationId: submit.operationId,
    })
    await expect(handleCompanionProductOperation(cancel, dependencies)).resolves.toMatchObject({
      type: 'confirmed', operationId: cancel.operationId,
    })
    expect(calls).toEqual([
      ['session/prompt', { args: { request: {
        requestId: submit.operationId,
        sessionId,
        mode: 'queue',
        content: [{ type: 'text', text: 'continue' }],
      } } }],
      ['session/cancel', { args: { request: { sessionId } } }],
    ])
  })

  it('retries a pairing ledger submit without a second Host prompt', async () => {
    let prompts = 0
    const loopback = await listenCompanionHost({
      onUnary: (method) => {
        if (method === 'session/prompt') prompts += 1
      },
    })
    const owner = new DesktopCompanionProductOwner({
      timeoutMs: 2_000, responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    })
    const ledger = await DesktopCompanionOperationLedger.load({
      load: async () => [],
      save: async () => {},
    })
    owner.installLedger(ledger)
    const uninstall = owner.installHost(loopback.origin)
    const submit = op({ type: 'submit-prompt', sessionId, text: 'continue' })
    const pairing = baseDependencies(hostRpc(async () => {
      throw new Error('owner must use its installed Host RPC')
    }))
    await expect(owner.handle(submit, pairing)).resolves.toMatchObject({
      type: 'confirmed', operationId: submit.operationId,
    })
    await expect(owner.handle(submit, pairing)).resolves.toMatchObject({
      type: 'confirmed', operationId: submit.operationId,
    })
    expect(prompts).toBe(1)
    uninstall()
  })

  it('creates Workspace-owned and Ungrouped Sessions through the exact Host request', async () => {
    const calls: Array<[string, Record<string, unknown>]> = []
    const dependencies = baseDependencies(hostRpc(async (method, payload) => {
      calls.push([method, payload])
      return { ok: true, value: { sessionId: `session-created-${String(calls.length)}` } }
    }))
    const workspace = op({ type: 'create-session', workspaceId: 'workspace-product' as never })
    const ungrouped = op({ type: 'create-session' })

    await expect(handleCompanionProductOperation(workspace, dependencies)).resolves.toMatchObject({
      type: 'session-created', operationId: workspace.operationId, sessionId: 'session-created-1',
    })
    await expect(handleCompanionProductOperation(ungrouped, dependencies)).resolves.toMatchObject({
      type: 'session-created', operationId: ungrouped.operationId, sessionId: 'session-created-2',
    })
    expect(calls).toEqual([
      ['session.create', { workspaceId: 'workspace-product' }],
      ['session.create', {}],
    ])
  })

  it('settles pairing-private Approval and Ask User requests through $events/result', async () => {
    const completeEvent = vi.fn<DesktopHostRpc['completeEvent']>(async () => ({ ok: true, value: undefined }))
    const host = hostRpc(async () => { throw new Error('settlement must not use an arbitrary Host method') }, completeEvent)
    const dependencies = baseDependencies(host)
    const interactionId = parseCompanionInteractionId('interaction-product')
    dependencies.resolveInteraction = () => ({
      eventId: 'event-approval' as never,
      clientId: 'client-generation' as never,
      kind: 'approval', sessionId,
      approvalId: 'approval-product',
    })
    const operation = op({
      type: 'settle-interaction', sessionId, interactionId,
      settlement: { kind: 'approval', outcome: 'allowed-once' },
    })
    await expect(handleCompanionProductOperation(operation, dependencies)).resolves.toEqual({
      type: 'interaction-receipt', operationId: operation.operationId, accepted: true,
    })
    expect(completeEvent).toHaveBeenCalledWith({
      clientId: 'client-generation',
      eventId: 'event-approval',
      outcome: { kind: 'result', value: 'allowed-once' },
    })
    const reject = op({
      type: 'settle-interaction', sessionId, interactionId,
      settlement: { kind: 'approval', outcome: 'rejected' },
    })
    await expect(handleCompanionProductOperation(reject, dependencies)).resolves.toEqual({
      type: 'interaction-receipt', operationId: reject.operationId, accepted: true,
    })
    expect(completeEvent).toHaveBeenLastCalledWith({
      clientId: 'client-generation',
      eventId: 'event-approval',
      outcome: { kind: 'result', value: 'rejected' },
    })
  })

  it('rejects an expired Ask User locally and cancels through ASK_CANCELLED', async () => {
    const completeEvent = vi.fn<DesktopHostRpc['completeEvent']>(async () => ({ ok: true, value: undefined }))
    const host = hostRpc(async () => { throw new Error('expired settlement must not invent Host not-pending') }, completeEvent)
    const dependencies = baseDependencies(host)
    const missing = op({
      type: 'settle-interaction', sessionId,
      interactionId: parseCompanionInteractionId('interaction-missing'),
      settlement: { kind: 'question', answers: [{ id: 'q1', selected: ['Yes'] }] },
    })
    await expect(handleCompanionProductOperation(missing, dependencies)).resolves.toEqual({
      type: 'interaction-receipt', operationId: missing.operationId, accepted: false, reason: 'not-pending',
    })
    expect(completeEvent).not.toHaveBeenCalled()
    const interactionId = parseCompanionInteractionId('interaction-question')
    dependencies.resolveInteraction = () => ({
      eventId: 'event-question' as never,
      clientId: 'client-generation' as never,
      kind: 'question', sessionId,
    })
    const cancel = op({
      type: 'settle-interaction', sessionId, interactionId,
      settlement: { kind: 'question-cancelled' },
    })
    await expect(handleCompanionProductOperation(cancel, dependencies)).resolves.toEqual({
      type: 'interaction-receipt', operationId: cancel.operationId, accepted: true,
    })
    expect(completeEvent).toHaveBeenCalledWith({
      clientId: 'client-generation',
      eventId: 'event-question',
      outcome: {
        kind: 'rejected',
        error: {
          name: 'UserQuestionError',
          message: 'the user cancelled ask_user_question',
          code: 'ASK_CANCELLED',
        },
      },
    })
  })

  it('refuses routed member questions with a stable typed business failure', async () => {
    const host = hostRpc(async () => { throw new Error('member questions must not reach the Host yet') })
    const question = op({
      type: 'member-question',
      questionId: parseMemberQuestionId('member-question-product'),
      origin: {
        projectName: 'Atlas', originSessionTitle: 'Refactor the ingest pipeline',
        askerAccountId: 'account-asker', askerRole: 'admin',
        askerDisplayName: 'Ada', askerAvatarUrl: 'https://example.test/ada.png',
      },
      background: 'Pick a rollback window before the freeze.',
      questions: [{ id: 'q-1', question: 'Which rollback window do we pick?' }],
      references: [],
    })
    await expect(handleCompanionProductOperation(question, baseDependencies(host))).resolves.toEqual({
      type: 'operation-failed',
      operationId: question.operationId,
      failure: {
        kind: 'business', code: 'member-question-not-accepted',
        message: 'This Desktop does not accept routed member questions yet',
      },
    })
  })

  it('refuses routed document transfers with a stable typed business failure', async () => {
    const host = hostRpc(async () => { throw new Error('document transfers must not reach the Host yet') })
    const chunk = op({
      type: 'document-chunk',
      transferId: parseDocumentTransferId('document-transfer-product'),
      questionId: parseMemberQuestionId('member-question-product'),
      index: 0,
      total: 3,
      bytes: encodeProtocolBase64Url(Uint8Array.of(1, 2, 3)),
    })
    await expect(handleCompanionProductOperation(chunk, baseDependencies(host))).resolves.toEqual({
      type: 'operation-failed',
      operationId: chunk.operationId,
      failure: {
        kind: 'business', code: 'document-transfer-not-accepted',
        message: 'This Desktop does not accept document transfers yet',
      },
    })
  })

  it('returns exact historical image bytes as ordered chunks', async () => {
    const bytes = Uint8Array.of(0, 1, 2, 255)
    const dependencies = baseDependencies(hostRpc(async (method) => {
      expect(method).toBe('session.attachment')
      return { ok: true, value: {
        attachment: { id: 'image-product', mediaType: 'image/png', bytes: bytes.byteLength, sha256: '0'.repeat(64) },
        data: Buffer.from(bytes).toString('base64'),
      } }
    }))
    const operation = op({ type: 'read-image', sessionId, attachmentId: 'image-product' })
    await expect(handleCompanionProductOperation(operation, dependencies)).resolves.toMatchObject({
      type: 'image-chunk', operationId: operation.operationId, index: 0, count: 1,
      mediaType: 'image/png', data: 'AAEC_w',
    })
  })

  it.each([
    ['binary', 'archive.bin', Uint8Array.of(0, 255, 1, 128)],
    ['image', 'pixel.png', Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)],
    ['text', 'notes.txt', new TextEncoder().encode('actual text attachment')],
  ])('downloads, verifies, decrypts, and submits actual %s bytes through the Session attachment path', async (
    kind,
    fileName,
    plaintext,
  ) => {
    const prepared = await offer(fileName, plaintext, `operation-${kind}`)
    const host = hostRpc(() => { throw new Error('attachment must not become a placeholder Host prompt') })
    const submitAttachment = vi.fn(async () => ({ ok: true, value: { accepted: true } } as const))
    const result = await handleCompanionProductOperation(prepared.operation, {
      host,
      pairingId,
      attachmentKey,
      now: () => 1_000,
      downloadAttachment: async () => prepared.ciphertext,
      submitAttachment,
    })

    expect(result).toMatchObject({ type: 'confirmed', operationId: prepared.operation.operationId })
    expect(submitAttachment).toHaveBeenCalledOnce()
    expect(submitAttachment.mock.calls[0]?.[0]).toEqual({
      sessionId, operationId: prepared.operation.operationId,
      fileName, mediaType: prepared.operation.mediaType, plaintext,
    })
    expect(JSON.stringify(submitAttachment.mock.calls)).not.toContain(`Attached: ${fileName}`)
  })

  it('returns explicit attachment rejection results for expiry and hash failure', async () => {
    const expired = await offer('expired.bin', Uint8Array.of(1), 'operation-expired')
    const hash = await offer('hash.bin', Uint8Array.of(2), 'operation-hash')
    const dependencies = {
      host: hostRpc(() => { throw new Error('rejected attachment must not call Host') }),
      pairingId,
      attachmentKey,
      now: () => 2_000,
      downloadAttachment: async () => hash.ciphertext,
      submitAttachment: async () => { throw new Error('rejected attachment must not submit') },
    }
    await expect(handleCompanionProductOperation(expired.operation, dependencies)).resolves.toEqual({
      type: 'attachment-rejected',
      operationId: expired.operation.operationId,
      reason: 'expired',
    })
    await expect(handleCompanionProductOperation({
      ...hash.operation,
      ciphertextSha256: '0'.repeat(64),
      expiresAt: 3_000,
    }, dependencies)).resolves.toEqual({
      type: 'attachment-rejected',
      operationId: hash.operation.operationId,
      reason: 'hash-mismatch',
    })
  })

  it('returns authoritative full-text hits and no-hit results without cached substring filtering', async () => {
    const operation = search('needle')
    let items = [{ sessionId: 'session-hit', snippet: 'Desktop indexed needle' }]
    let expectedQuery = 'needle'
    const call = vi.fn(async (method: string, payload: Record<string, unknown>): Promise<DesktopHostRpcResult> => {
      expect(method).toBe('session.search')
      expect(payload).toEqual({ query: expectedQuery })
      return {
        ok: true,
        value: {
          items,
          hasMore: false,
        },
      }
    })
    const dependencies = baseDependencies(hostRpc(call))
    await expect(handleCompanionProductOperation(operation, dependencies)).resolves.toEqual({
      type: 'session-search',
      operationId: operation.operationId,
      items: [{ sessionId: parseCompanionSessionId('session-hit'), snippet: 'Desktop indexed needle' }],
      hasMore: false,
    })
    items = []
    expectedQuery = 'absent'
    await expect(handleCompanionProductOperation(search('absent'), dependencies)).resolves.toMatchObject({
      type: 'session-search', items: [], hasMore: false,
    })
    expect(call).toHaveBeenCalledTimes(2)
  })

  it('excludes Desktop-archived Sessions from authoritative full-text results', async () => {
    const operation = search('needle')
    const dependencies = baseDependencies(hostRpc(async (method) => {
      expect(method).toBe('session.search')
      return { ok: true, value: { items: [
        { sessionId: 'session-visible', snippet: 'Visible needle' },
        { sessionId: 'session-archived', snippet: 'Archived needle' },
      ], hasMore: false } }
    }), { items: [], archivedSessionIds: ['session-archived'] })

    await expect(handleCompanionProductOperation(operation, dependencies)).resolves.toEqual({
      type: 'session-search',
      operationId: operation.operationId,
      items: [{ sessionId: parseCompanionSessionId('session-visible'), snippet: 'Visible needle' }],
      hasMore: false,
    })
  })

  it.each([
    ['disabled', { kind: 'business', code: 'internal', message: 'session search failed: SESSION_QUERY_SEARCH_DISABLED' }],
    ['index', { kind: 'business', code: 'internal', message: 'session search failed: SESSION_QUERY_INDEX_FAILED' }],
    ['http-400', { kind: 'http', code: 'HOST_HTTP_STATUS', message: 'Desktop Host returned HTTP 400', status: 400 }],
  ] as const)('projects %s Host search refusal without stream loss', async (_name, failure) => {
    const operation = search(_name)
    await expect(handleCompanionProductOperation(operation, baseDependencies(hostRpc(async () => ({ ok: false, failure })))),
    ).resolves.toEqual({ type: 'operation-failed', operationId: operation.operationId, failure })
  })

  it('installs the real Web Host RPC in the product owner and invalidates it on Host exit', async () => {
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', chunk => chunks.push(chunk as Buffer))
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { rpcId: string; method: string }
        response.end(JSON.stringify({
          type: 'server-response',
          rpcId: body.rpcId,
          result: {
            ok: true,
            value: { items: [{ sessionId: 'session-real-entry', snippet: 'real Host result' }], hasMore: false },
          },
        }))
      })
    })
    const wss = new WebSocketServer({ noServer: true })
    server.on('upgrade', (request, socket, head) => {
      if (request.url !== '/api/remote.mux') {
        socket.destroy()
        return
      }
      wss.handleUpgrade(request, socket, head, (websocket) => {
        websocket.on('message', (data) => {
          const text = typeof data === 'string' ? data : Buffer.from(data as Uint8Array).toString('utf8')
          const message = JSON.parse(text) as { type: string; streamId: string; endpoint?: string }
          if (message.type === 'open' && message.endpoint === 'workspace/follow') {
            websocket.send(JSON.stringify({
              type: 'item',
              streamId: message.streamId,
              value: { type: 'baseline', value: { items: [], archivedSessionIds: [] } },
            }))
          }
        })
      })
    })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    closeServers.push(async () => {
      for (const client of wss.clients) client.terminate()
      wss.close()
      server.close()
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('expected TCP address')
    const owner = new DesktopCompanionProductOwner({
      responseMaxBytes: REMOTE_PROTOCOL_LIMITS.companionMessageBytes,
    })
    const uninstallReplaced = owner.installHost(`http://127.0.0.1:${String(address.port)}`)
    const uninstall = owner.installHost(`http://127.0.0.1:${String(address.port)}`)
    uninstallReplaced()
    await expect(owner.handle(search('entry'), baseDependencies(hostRpc(() => {
      throw new Error('owner must use its installed Host RPC')
    })))).resolves.toEqual({
      type: 'session-search',
      operationId: parseCompanionOperationId('search-entry'),
      items: [{ sessionId: parseCompanionSessionId('session-real-entry'), snippet: 'real Host result' }],
      hasMore: false,
    })
    uninstall()
    await expect(owner.handle(search('after-exit'), baseDependencies(hostRpc(() => {
      throw new Error('uninstalled owner must not call an injected Host')
    })))).resolves.toEqual({
      type: 'operation-failed',
      operationId: parseCompanionOperationId('search-after-exit'),
      failure: {
        kind: 'wire', code: 'HOST_WIRE_INVALID', message: 'Desktop Web Host is not available',
      },
    })
  })
})

async function offer(fileName: string, plaintext: Uint8Array, id: string): Promise<{
  operation: CompanionOfferAttachmentOperation
  ciphertext: Uint8Array
}> {
  const key = await deriveCompanionAttachmentKey(attachmentKey)
  const sealed = await sealCompanionAttachment(key, plaintext)
  return {
    ciphertext: sealed.ciphertext,
    operation: {
      type: 'offer-attachment',
      operationId: parseCompanionOperationId(id),
      sessionId,
      capability: 'A'.repeat(43) as never,
      ciphertextSha256: sealed.ciphertextSha256,
      byteLength: sealed.ciphertext.byteLength,
      expiresAt: 2_000,
      fileName,
      mediaType: 'application/octet-stream',
    },
  }
}

function search(query: string): CompanionSearchSessionsOperation {
  return {
    type: 'search-sessions',
    operationId: parseCompanionOperationId(`search-${query}`),
    query,
  }
}

function hostRpc(call: DesktopHostRpc['call'], completeEvent?: DesktopHostRpc['completeEvent']): DesktopHostRpc {
  return {
    call,
    followEvents: async () => {},
    completeEvent: completeEvent ?? (async () => ({ ok: true, value: undefined })),
    followWorkspaces: async () => {},
    followSession: async () => {},
  }
}

function sessionFollowSnapshot(value: {
  cursor: number
  hasMore: boolean
  records: unknown[]
}): unknown {
  return {
    type: 'snapshot',
    header: { version: 0, id: 'session-product', createdAt: 1 },
    projections: { asOfSeq: value.cursor, values: {} },
    ...value,
  }
}

function historyCache(events: unknown[], hasMore = false) {
  return {
    page: async () => ({ ok: true as const, value: { events, hasMore } }),
  } as never
}

function baseDependencies(host: DesktopHostRpc, workspaceValue: unknown = { items: [], archivedSessionIds: [] }) {
  return {
    host,
    workspaceSnapshot: () => Promise.resolve(workspaceValue as never),
    sessionHistory: historyCache([]),
    pairingId,
    attachmentKey,
    now: () => 1_000,
    downloadAttachment: async () => { throw new Error('search must not download attachments') },
    submitAttachment: async () => { throw new Error('search must not submit attachments') },
    generation: 1,
    desktopRevision: 1,
    desktopName: 'Authenticated Desktop',
    resolveInteraction: () => undefined,
    pendingInteractions: () => [],
  }
}

function op<T extends Omit<CompanionOperation, 'operationId'>>(operation: T): T & { operationId: ReturnType<typeof parseCompanionOperationId> } {
  return { ...operation, operationId: parseCompanionOperationId(`operation-${operation.type}`) }
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => { resolve = settle })
  return { promise, resolve }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function listenCompanionHost(options?: {
  workspaceFollowValue?: unknown
  onUnary?: (method: string) => void
  onEventsOpen?: (send: (value: unknown) => void) => void
}): Promise<{ origin: string }> {
  const workspaceFollowValue = options?.workspaceFollowValue ?? {
    type: 'baseline', value: { items: [], archivedSessionIds: [] },
  }
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(chunk as Buffer))
    request.on('end', () => {
      let rpcId = 'rpc'
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { rpcId?: string; method?: string }
        rpcId = body.rpcId ?? rpcId
        if (body.method !== undefined) options?.onUnary?.(body.method)
        if (body.method === 'session/prompt' || body.method === 'session/cancel' || body.method === '$events/result') {
          response.end(JSON.stringify({
            type: 'server-response', rpcId,
            result: { ok: true, value: body.method === '$events/result' ? undefined : { accepted: true } },
          }))
          return
        }
        if (body.method === 'session/list' || body.method === 'session.list') {
          response.end(JSON.stringify({
            type: 'server-response', rpcId,
            result: { ok: true, value: { items: [{
              sessionId: 'session-product', updatedAt: 9, running: false, blank: false,
            }] } },
          }))
          return
        }
        if (body.method === 'session.search') {
          response.end(JSON.stringify({
            type: 'server-response', rpcId,
            result: { ok: true, value: { items: [{ sessionId: 'session-hit', snippet: 'needle' }], hasMore: false } },
          }))
          return
        }
      } catch {
        // Unary bodies that are not Host RPC JSON stay a wire failure.
      }
      response.end(JSON.stringify({
        type: 'server-response', rpcId, result: { ok: false, error: { code: 'unavailable', message: 'no' } },
      }))
    })
  })
  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/api/remote.mux') {
      socket.destroy()
      return
    }
    wss.handleUpgrade(request, socket, head, (websocket) => {
      websocket.on('message', (data) => {
        const text = typeof data === 'string' ? data : Buffer.from(data as Uint8Array).toString('utf8')
        const message = JSON.parse(text) as { type?: string; streamId?: string; endpoint?: string }
        if (message.type === 'open' && message.endpoint === 'workspace/follow' && message.streamId !== undefined) {
          websocket.send(JSON.stringify({
            type: 'item',
            streamId: message.streamId,
            value: workspaceFollowValue,
          }))
        }
        if (message.type === 'open' && message.endpoint === '$events' && message.streamId !== undefined) {
          websocket.send(JSON.stringify({
            type: 'item',
            streamId: message.streamId,
            value: { type: 'ready', clientId: 'client-loopback', host: { home: '/tmp' } },
          }))
          options?.onEventsOpen?.((value) => {
            websocket.send(JSON.stringify({
              type: 'item',
              streamId: message.streamId,
              value,
            }))
          })
        }
      })
    })
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  closeServers.push(async () => {
    wss.close()
    for (const client of wss.clients) client.terminate()
    wss.close()
    server.close()
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('expected TCP address')
  return { origin: `http://127.0.0.1:${String(address.port)}` }
}
