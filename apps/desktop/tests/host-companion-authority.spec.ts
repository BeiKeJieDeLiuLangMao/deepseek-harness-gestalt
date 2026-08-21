import { describe, expect, it } from 'vitest'
import {
  negotiateDevelopmentCompanionProtocol,
  openDevelopmentCompanionMessage,
  sealDevelopmentCompanionMessage,
} from '@deepseek-ai/dsh-remote-access-client'
import {
  parseAttachmentCapability,
  parseCompanionOperationId,
  parseCompanionSessionId,
} from '@deepseek-ai/dsh-remote-protocol'
import { HostCompanionAuthority } from '../src/host-companion-authority.ts'
import type { DesktopHostRpc, DesktopHostRpcResult, DesktopHostStreamFrame } from '../src/host-rpc.ts'

describe('Host Companion authority', () => {
  it('projects the Host Session catalog on sync and commits create and prompt through Host RPC', async () => {
    const host = createMemoryHost()
    const authority = new HostCompanionAuthority({ schedule: (task) => { task(); return () => {} } })
    await expect(authority.reply(Uint8Array.of(1))).resolves.toEqual([Uint8Array.of(1)])
    authority.bindHost(host)
    const sync = await authority.reply(Uint8Array.of(1))
    expect(sync[0]).toEqual(Uint8Array.of(1))
    await expect(openDevelopmentCompanionMessage(negotiateDevelopmentCompanionProtocol(), sync[1]!)).resolves.toMatchObject({
      type: 'projection',
      projection: {
        type: 'session-catalog',
        sessions: [expect.objectContaining({
          sessionId: 'session-desktop',
          title: 'Desktop Session',
          workspace: 'Docs',
        })],
      },
    })

    const protocol = negotiateDevelopmentCompanionProtocol()
    const created = await authority.reply(await sealDevelopmentCompanionMessage(protocol, {
      type: 'operation',
      operation: {
        type: 'create-session',
        operationId: parseCompanionOperationId('operation-create'),
        sessionId: parseCompanionSessionId('session-mobile'),
        title: 'Ungrouped Session',
      },
    }))
    expect(host.calls).toContainEqual(['session.create', { sessionId: 'session-mobile' }])
    expect(host.calls).toContainEqual(['session.rename', { sessionId: 'session-mobile', title: 'Ungrouped Session' }])
    await expect(openDevelopmentCompanionMessage(protocol, created[0]!)).resolves.toMatchObject({
      type: 'result',
      result: { type: 'confirmed', operationId: 'operation-create', outcome: 'accepted' },
    })

    host.history.set('session-mobile', [
      { event: { type: 'user/message', data: { content: [{ type: 'text', text: 'hello from Mobile' }] } } },
      { event: { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'Host accepted the prompt' }] } } } },
    ])
    const prompted = await authority.reply(await sealDevelopmentCompanionMessage(protocol, {
      type: 'operation',
      operation: {
        type: 'submit-prompt',
        operationId: parseCompanionOperationId('operation-prompt'),
        sessionId: parseCompanionSessionId('session-mobile'),
        text: 'hello from Mobile',
      },
    }))
    expect(host.calls).toContainEqual([
      'session.prompt',
      { sessionId: 'session-mobile', mode: 'queue', content: [{ type: 'text', text: 'hello from Mobile' }] },
    ])
    const page = await openDevelopmentCompanionMessage(protocol, prompted[1]!)
    expect(page).toMatchObject({
      type: 'projection',
      projection: {
        type: 'transcript-page',
        sessionId: 'session-mobile',
        streaming: true,
        entries: [
          { type: 'text', role: 'user', text: 'hello from Mobile' },
          { type: 'text', role: 'assistant', text: 'Host accepted the prompt' },
        ],
      },
    })

    const searched = await authority.reply(await sealDevelopmentCompanionMessage(protocol, {
      type: 'operation',
      operation: {
        type: 'search-sessions',
        operationId: parseCompanionOperationId('operation-search'),
        query: 'Desktop',
      },
    }))
    expect(host.calls).toContainEqual(['session.search', { query: 'Desktop' }])
    await expect(openDevelopmentCompanionMessage(protocol, searched[1]!)).resolves.toMatchObject({
      type: 'projection',
      projection: {
        type: 'session-search',
        query: 'Desktop',
        sessions: [expect.objectContaining({
          sessionId: 'session-desktop',
          title: 'Desktop Session',
          snippet: 'hello from the Host transcript',
        })],
      },
    })
  })

  it('orders the Host catalog by recency', async () => {
    const host = createMemoryHost()
    host.sessions.unshift({
      sessionId: 'session-old',
      running: false,
      updatedAt: 1,
      projections: { values: { title: 'Oldest' } },
    })
    host.sessions.push({
      sessionId: 'session-new',
      running: false,
      updatedAt: 9,
      projections: { values: { title: 'Newest' } },
    })
    const authority = new HostCompanionAuthority({ schedule: (task) => { task(); return () => {} } })
    authority.bindHost(host)
    const sync = await authority.reply(Uint8Array.of(1))
    const catalog = await openDevelopmentCompanionMessage(negotiateDevelopmentCompanionProtocol(), sync[1]!)
    expect(catalog).toMatchObject({
      type: 'projection',
      projection: {
        type: 'session-catalog',
        sessions: [
          expect.objectContaining({ title: 'Newest' }),
          expect.objectContaining({ title: 'Desktop Session' }),
          expect.objectContaining({ title: 'Oldest' }),
        ],
      },
    })
  })

  it('submits an offered attachment name through Host session.prompt', async () => {
    const host = createMemoryHost()
    host.history.set('session-desktop', [
      { event: { type: 'user/message', data: { content: [{ type: 'text', text: 'Attached: notes.txt' }] } } },
    ])
    const authority = new HostCompanionAuthority({ schedule: (task) => { task(); return () => {} } })
    authority.bindHost(host)
    const protocol = negotiateDevelopmentCompanionProtocol()
    const attached = await authority.reply(await sealDevelopmentCompanionMessage(protocol, {
      type: 'operation',
      operation: {
        type: 'offer-attachment',
        operationId: parseCompanionOperationId('operation-attach'),
        sessionId: parseCompanionSessionId('session-desktop'),
        capability: parseAttachmentCapability('A'.repeat(43)),
        ciphertextSha256: 'a'.repeat(64),
        byteLength: 1,
        expiresAt: 3_000_000_000_000,
        fileName: 'notes.txt',
      },
    }))
    expect(host.calls).toContainEqual([
      'session.prompt',
      { sessionId: 'session-desktop', mode: 'queue', content: [{ type: 'text', text: 'Attached: notes.txt' }] },
    ])
    await expect(openDevelopmentCompanionMessage(protocol, attached[1]!)).resolves.toMatchObject({
      type: 'projection',
      projection: {
        type: 'transcript-page',
        sessionId: 'session-desktop',
        entries: [expect.objectContaining({ type: 'text', role: 'user', text: 'Attached: notes.txt' })],
      },
    })
  })

  it('settles a Host approval through /api/respond after the mux requested frame', async () => {
    const host = createMemoryHost()
    const authority = new HostCompanionAuthority({ schedule: (task) => { task(); return () => {} } })
    authority.bindHost(host)
    host.pushMux({
      rpcId: 'rpc-approval',
      payload: {
        type: 'approval/requested',
        sessionId: 'session-desktop',
        approvalId: 'approval-1',
        toolName: 'bash',
        reason: 'Allow write',
      },
    })
    const protocol = negotiateDevelopmentCompanionProtocol()
    const settled = await authority.reply(await sealDevelopmentCompanionMessage(protocol, {
      type: 'operation',
      operation: {
        type: 'settle-approval',
        operationId: parseCompanionOperationId('operation-settle'),
        sessionId: parseCompanionSessionId('session-desktop'),
        interactionId: 'approval-1' as never,
        decision: 'once',
      },
    }))
    expect(host.responses).toEqual([{
      rpcId: 'rpc-approval',
      value: { sessionId: 'session-desktop', approvalId: 'approval-1', outcome: 'allowed-once' },
    }])
    await expect(openDevelopmentCompanionMessage(protocol, settled[0]!)).resolves.toMatchObject({
      type: 'result',
      result: { type: 'confirmed', operationId: 'operation-settle' },
    })
  })
})

function createMemoryHost(): DesktopHostRpc & {
  calls: Array<[string, Record<string, unknown>]>
  responses: Array<{ rpcId: string; value: unknown }>
  history: Map<string, unknown[]>
  sessions: Array<Record<string, unknown> & { sessionId: string; running: boolean }>
  pushMux: (frame: DesktopHostStreamFrame) => void
} {
  const sessions: Array<Record<string, unknown> & { sessionId: string; running: boolean }> = [{
    sessionId: 'session-desktop',
    running: false,
    updatedAt: 5,
    projections: { values: { title: 'Desktop Session' } },
  }]
  const workspaces = {
    items: [{ workspaceId: 'ws-docs', title: 'Docs', sessionIds: ['session-desktop'] }],
    archivedSessionIds: [],
  }
  const history = new Map<string, unknown[]>()
  const calls: Array<[string, Record<string, unknown>]> = []
  const responses: Array<{ rpcId: string; value: unknown }> = []
  let mux: ((frame: DesktopHostStreamFrame) => void) | undefined
  return {
    calls,
    responses,
    history,
    sessions,
    pushMux(frame) { mux?.(frame) },
    async call(method, payload): Promise<DesktopHostRpcResult> {
      calls.push([method, payload])
      if (method === 'session.list') return { ok: true, value: { items: sessions } }
      if (method === 'workspace.list') return { ok: true, value: workspaces }
      if (method === 'session.create') {
        sessions.push({
          sessionId: String(payload.sessionId),
          running: false,
          projections: { values: { title: 'Ungrouped Session' } },
        })
        return { ok: true, value: { sessionId: payload.sessionId } }
      }
      if (method === 'session.rename' || method === 'session.cancel') return { ok: true, value: { accepted: true } }
      if (method === 'session.prompt') return { ok: true, value: { accepted: true } }
      if (method === 'session.history') {
        return { ok: true, value: { events: history.get(String(payload.sessionId)) ?? [] } }
      }
      if (method === 'session.search') {
        return {
          ok: true,
          value: {
            items: [{ sessionId: 'session-desktop', snippet: 'hello from the Host transcript' }],
            hasMore: false,
          },
        }
      }
      return { ok: false, error: { code: 'unknown', message: method } }
    },
    async respond(rpcId, value) {
      responses.push({ rpcId, value })
      return { accepted: true }
    },
    subscribeMux(onFrame) {
      mux = onFrame
      return () => { mux = undefined }
    },
    subscribeHost() {
      return () => {}
    },
  }
}
