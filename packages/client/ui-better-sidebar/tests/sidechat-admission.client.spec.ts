/**
 * Side Chat product adapter on live ClientSessions: installSidechatAdmission
 * (the same registration `apply` uses) routes canonical Session.prompt /
 * cancel / updateQueue through Host sidechat JSON, never by title, and never
 * through stock session.prompt.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MessageId } from '@deepseek-ai/dsh-llm/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionRequestId } from '../../../api/session-controller/src/types.ts'
import { ClientSessions } from '../../../api/session-controller/src/client/sessions/service.ts'
import {
  FakeApiClient,
  fakeRemote,
  ok,
} from '../../../api/session-controller/tests/fake-api.client.ts'
import { registerSidechatDraft } from '../src/client/api.ts'
import { installSidechatAdmission } from '../src/client/sidechat-admission.ts'
import type { SidebarContext } from '../src/context-types.ts'
import { SIDE_LABEL_PREFIX } from '../src/sidechat-core.ts'

const sid = (value: string): SessionId => value as SessionId
const mid = (value: string): MessageId => value as MessageId

function failureOf<T>(result: RemoteResult<T>): RemoteFailure {
  if (result.ok) throw new Error('expected a Remote failure')
  return result.error
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

interface FetchCall {
  method: string
  body: Record<string, unknown>
}

function stubSidebarFetch(handler?: (call: FetchCall) => { ok: boolean; value?: unknown; error?: { code: string; message: string } }): FetchCall[] {
  const calls: FetchCall[] = []
  vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    const method = url.slice(url.lastIndexOf('/') + 1)
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    const call = { method, body }
    calls.push(call)
    const envelope = handler?.(call) ?? { ok: true, value: { accepted: true, childId: body.childId } }
    return {
      ok: envelope.ok,
      status: envelope.ok ? 200 : 409,
      json: async () => envelope,
    }
  })
  return calls
}

function bench(): { svc: ClientSessions; api: FakeApiClient; ctx: SidebarContext } {
  const root = new Context()
  const api = new FakeApiClient()
  const remotes = fakeRemote(api)
  const svc = new ClientSessions(root, remotes)
  const ctx = {
    sessions: svc,
    remote: {
      commands: {
        execute: () => Promise.resolve(ok(undefined)),
      },
    },
  } as unknown as SidebarContext
  return { svc, api, ctx }
}

describe('Side Chat Session admission', () => {
  it('routes a draft first prompt through sidechat.start from Session.prompt', async () => {
    const { svc, api, ctx } = bench()
    const parentId = sid('session-parent')
    const childId = sid('session-sidechat-draft')
    const fetches = stubSidebarFetch()
    installSidechatAdmission(ctx)
    svc.stageProvisional({
      sessionId: childId,
      parentSessionId: parentId,
      origin: 'subagent',
      title: 'New thread',
    })
    registerSidechatDraft(childId, parentId)

    const result = await svc.binding(childId)!.session.prompt(
      [{ type: 'text', text: 'first question' }],
      'queue',
      undefined,
      'request-sidechat-first' as SessionRequestId,
    )

    expect(result).toEqual({ ok: true, value: { accepted: true } })
    expect(fetches).toEqual([{
      method: 'sidechat.start',
      body: {
        sessionId: parentId,
        childId,
        text: 'first question',
        requestId: 'request-sidechat-first',
      },
    }])
    expect(api.callsOf('session.prompt')).toEqual([])
    expect(api.callsOf('subagents.prompt')).toEqual([])
  })

  it('routes published prompt, cancel, and queue through Host sidechat JSON', async () => {
    const { svc, api, ctx } = bench()
    const parentId = sid('session-parent-live')
    const childId = sid('session-sidechat-live')
    const itemId = mid('queued-1')
    const fetches = stubSidebarFetch()
    installSidechatAdmission(ctx)
    registerSidechatDraft(childId, parentId)
    svc.stageProvisional({
      sessionId: childId,
      parentSessionId: parentId,
      origin: 'subagent',
      title: 'New thread',
    })
    await svc.binding(childId)!.session.prompt([{ type: 'text', text: 'go' }], 'queue')

    const prompt = await svc.binding(childId)!.session.prompt([{ type: 'text', text: 'again' }], 'steer')
    const cancel = await svc.binding(childId)!.session.cancel()
    const queue = await svc.binding(childId)!.session.updateQueue(itemId, { kind: 'remove' })

    expect(prompt).toEqual({ ok: true, value: { accepted: true } })
    expect(cancel).toEqual({ ok: true, value: { accepted: true } })
    expect(queue).toEqual({ ok: true, value: { accepted: true } })
    expect(fetches.map(call => call.method)).toEqual([
      'sidechat.start',
      'sidechat.prompt',
      'sidechat.cancel',
      'sidechat.updateQueue',
    ])
    expect(fetches[1]).toEqual({
      method: 'sidechat.prompt',
      body: { childId, text: 'again', mode: 'steer' },
    })
    expect(api.callsOf('session.prompt')).toEqual([])
    expect(api.callsOf('session.cancel')).toEqual([])
    expect(api.callsOf('session.updateQueue')).toEqual([])
  })

  it('rebuilds attachment and queue refusals without calling stock Remotes', async () => {
    const { svc, api, ctx } = bench()
    const parentId = sid('session-failure-parent')
    const childId = sid('session-failure-child')
    const fetches = stubSidebarFetch((call) => {
      if (call.method !== 'sidechat.updateQueue') {
        return { ok: true, value: { accepted: true, childId: call.body.childId } }
      }
      const itemId = String(call.body.itemId)
      if (itemId === 'queue-missing') {
        return { ok: false, error: { code: 'queue-item-not-found', message: 'queued item is no longer pending' } }
      }
      if (itemId === 'queue-running') {
        return { ok: false, error: { code: 'steer-unavailable', message: 'current turn no longer accepts steering' } }
      }
      return { ok: false, error: { code: 'sidechat-error', message: 'unexpected queue failure' } }
    })
    installSidechatAdmission(ctx)
    registerSidechatDraft(childId, parentId)
    svc.stageProvisional({
      sessionId: childId,
      parentSessionId: parentId,
      origin: 'subagent',
      title: 'New thread',
    })

    const attachment = await svc.binding(childId)!.session.prompt([{
      type: 'image',
      mediaType: 'image/png',
      data: 'AA==',
    }], 'queue')
    const attachmentFailure = failureOf(attachment)
    expect(attachmentFailure).toBeInstanceOf(Error)
    expect(attachmentFailure).toMatchObject({
      code: 'session/attachment-invalid',
      message: 'Image input is unavailable in Side Chat.',
      details: { reason: 'SUBAGENT_IMAGE_UNSUPPORTED' },
    })
    expect(fetches).toEqual([])
    await expect(svc.binding(childId)!.session.cancel()).resolves.toEqual({
      ok: true,
      value: { accepted: true },
    })
    expect(fetches).toEqual([])
    expect(svc.skillCatalogSessionId(childId)).toBe(parentId)

    await svc.binding(childId)!.session.prompt([{ type: 'text', text: 'publish' }], 'queue')
    expect(svc.skillCatalogSessionId(childId)).toBe(childId)
    const missing = await svc.binding(childId)!.session.updateQueue(mid('queue-missing'), { kind: 'remove' })
    const missingFailure = failureOf(missing)
    expect(missingFailure).toBeInstanceOf(Error)
    expect(missingFailure).toMatchObject({
      code: 'session/queue-item-not-found',
      details: { itemId: mid('queue-missing') },
    })

    const unavailable = await svc.binding(childId)!.session.updateQueue(mid('queue-running'), { kind: 'steer' })
    expect(failureOf(unavailable)).toMatchObject({
      code: 'session/steer-unavailable',
      details: { itemId: mid('queue-running') },
    })
    const unknown = await svc.binding(childId)!.session.updateQueue(mid('queue-unknown'), { kind: 'remove' })
    expect(failureOf(unknown)).toMatchObject({
      code: 'gateway/internal',
      message: 'unexpected queue failure',
      details: {},
    })
    expect(api.callsOf('session.prompt')).toEqual([])
    expect(api.callsOf('session.updateQueue')).toEqual([])
  })

  it('keeps a failed draft retryable and folds HTTP and network failures once', async () => {
    const { svc, api, ctx } = bench()
    const parentId = sid('session-retry-parent')
    const childId = sid('session-retry-child')
    let startFails = true
    const fetches = stubSidebarFetch((call) => {
      if (call.method === 'sidechat.start' && startFails) {
        return { ok: false, error: { code: 'sidechat-error', message: 'parent is unavailable' } }
      }
      return { ok: true, value: { accepted: true, childId: call.body.childId } }
    })
    installSidechatAdmission(ctx)
    registerSidechatDraft(childId, parentId)
    svc.stageProvisional({
      sessionId: childId,
      parentSessionId: parentId,
      origin: 'subagent',
      title: 'New thread',
    })

    const failedStart = await svc.binding(childId)!.session.prompt([{ type: 'text', text: 'first' }], 'queue')
    expect(failureOf(failedStart)).toMatchObject({
      code: 'gateway/internal',
      message: 'parent is unavailable',
      details: {},
    })
    expect(svc.binding(childId)!.session.getSnapshot()).toMatchObject({
      blank: true,
      promptError: { op: 'send', error: { message: 'parent is unavailable' } },
    })

    startFails = false
    await expect(svc.binding(childId)!.session.prompt([{ type: 'text', text: 'retry' }], 'queue'))
      .resolves.toMatchObject({ ok: true })
    expect(fetches.slice(0, 2).map(call => call.method)).toEqual(['sidechat.start', 'sidechat.start'])

    vi.stubGlobal('fetch', async () => { throw new Error('connection lost') })
    const network = await svc.binding(childId)!.session.prompt([{ type: 'text', text: 'continue' }], 'queue')
    expect(failureOf(network)).toMatchObject({
      code: 'gateway/internal',
      message: 'connection lost',
      details: {},
    })
    const cancelled = await svc.binding(childId)!.session.cancel()
    expect(failureOf(cancelled)).toMatchObject({
      code: 'gateway/internal',
      message: 'connection lost',
      details: {},
    })
    const inspection = await svc.modelRoute(childId)!.inspect!()
    expect(failureOf(inspection)).toMatchObject({
      code: 'gateway/internal',
      message: 'connection lost',
      details: {},
    })
    const selection = await svc.modelRoute(childId)!.selectModel!({ provider: 'owned', model: 'broken' })
    expect(failureOf(selection)).toMatchObject({
      code: 'gateway/internal',
      message: 'connection lost',
      details: {},
    })
    expect(api.callsOf('session.prompt')).toEqual([])
    expect(api.callsOf('session.cancel')).toEqual([])
    expect(api.callsOf('session.selectModel')).toEqual([])
  })

  it('folds draft permission Remote failure and published routing errors through the owner', async () => {
    const { svc, api, ctx } = bench()
    const parentId = sid('session-command-parent')
    const draftId = sid('session-command-draft')
    const orphanId = sid('session-command-orphan')
    stubSidebarFetch()
    installSidechatAdmission(ctx)
    registerSidechatDraft(draftId, parentId)
    svc.stageProvisional({
      sessionId: draftId,
      parentSessionId: parentId,
      origin: 'subagent',
      title: 'New thread',
    })
    vi.spyOn(ctx.remote.commands, 'execute')
      .mockResolvedValueOnce(ok(undefined))
      .mockResolvedValueOnce({
        ok: false,
        error: new RemoteError('gateway/internal', 'permission denied upstream', {}),
      })

    await expect(svc.binding(draftId)!.session.command('/help')).resolves.toEqual({
      ok: true,
      value: { matched: false },
    })
    await expect(svc.binding(draftId)!.session.command('/permission read-only')).resolves.toEqual({
      ok: true,
      value: { matched: false },
    })

    const permission = await svc.binding(draftId)!.session.command('/permission read-only')
    const permissionFailure = failureOf(permission)
    expect(permissionFailure).toBeInstanceOf(Error)
    expect(permissionFailure).toMatchObject({
      code: 'gateway/internal',
      message: 'permission denied upstream',
      details: {},
    })

    const publishedId = sid('session-command-published')
    registerSidechatDraft(publishedId, parentId)
    svc.stageProvisional({
      sessionId: publishedId,
      parentSessionId: parentId,
      origin: 'subagent',
      title: 'New thread',
    })
    await svc.binding(publishedId)!.session.prompt([{ type: 'text', text: 'publish' }], 'queue')
    await expect(svc.binding(publishedId)!.session.command('/permission workspace-write'))
      .resolves.toEqual({ ok: true, value: { matched: true } })

    api.onList = () => Promise.resolve(ok({
      items: [{
        sessionId: orphanId,
        updatedAt: 100,
        running: false,
        blank: false,
        origin: 'subagent',
      }],
    }))
    await svc.refresh()
    // A known Side Chat id is the ownership credential; the missing parent remains a routing failure.
    registerSidechatDraft(orphanId, parentId)()
    const orphan = await svc.binding(orphanId)!.session.command('/permission read-only')
    expect(failureOf(orphan)).toMatchObject({
      code: 'gateway/internal',
      message: `Side Chat session "${orphanId}" has no parent`,
      details: {},
    })
    expect(api.callsOf('session.prompt')).toEqual([])
  })

  it('does not claim a same-title ordinary or catalog subagent without a Side Chat id', async () => {
    const { svc, api, ctx } = bench()
    const parentId = sid('session-title-parent')
    const ordinaryId = sid('session-titled-ordinary')
    const childId = sid('session-titled-child')
    stubSidebarFetch()
    installSidechatAdmission(ctx)
    api.onList = () => Promise.resolve(ok({
      items: [{
        sessionId: parentId,
        updatedAt: 100,
        running: false,
        blank: false,
      }, {
        sessionId: ordinaryId,
        updatedAt: 100,
        running: false,
        blank: false,
        origin: 'subagent',
        parentSessionId: parentId,
        title: `${SIDE_LABEL_PREFIX}impostor`,
      }],
    }))
    api.onSubagentList = () => Promise.resolve(ok({
      entries: [{
        kind: 'child',
        id: childId,
        mode: 'continuable',
        label: `${SIDE_LABEL_PREFIX}catalog`,
        activity: 'inactive',
        hasChildren: false,
      }],
      parentAvailable: true,
    }))
    await svc.refresh()
    await svc.refreshSubagents(parentId)
    svc.openSubagent({
      parentSessionId: parentId,
      childSessionId: childId,
      mode: 'continuable',
    })

    await svc.binding(ordinaryId)!.session.prompt([{ type: 'text', text: 'ordinary' }], 'queue')
    await svc.binding(childId)!.session.prompt([{ type: 'text', text: 'catalog' }], 'queue')

    expect(api.callsOf('session.prompt')).toEqual([expect.objectContaining({ sessionId: ordinaryId })])
    expect(api.callsOf('subagents.prompt')).toEqual([expect.objectContaining({
      parentSessionId: parentId,
      childSessionId: childId,
    })])
  })

  it('inspects Side Chat selection while the model directory keeps the shared Host catalog', async () => {
    const { svc, api, ctx } = bench()
    const parentId = sid('session-model-parent')
    const childId = sid('session-sidechat-model')
    const ordinaryId = sid('session-ordinary-model')
    const fetches = stubSidebarFetch(call => {
      if (call.method === 'sidechat.model') {
        return {
          ok: true,
          value: { current: { provider: 'owned', model: 'parent' }, routable: true },
        }
      }
      if (call.method === 'sidechat.selectModel') {
        return { ok: true, value: { selected: call.body.selection } }
      }
      return { ok: true, value: { accepted: true, childId: call.body.childId } }
    })
    installSidechatAdmission(ctx)
    api.onList = () => Promise.resolve(ok({
      items: [{ sessionId: ordinaryId, updatedAt: 100, running: false, blank: false }],
    }))
    await svc.refresh()
    registerSidechatDraft(childId, parentId)
    svc.stageProvisional({
      sessionId: childId,
      parentSessionId: parentId,
      origin: 'subagent',
      title: 'New thread',
    })

    const side = svc.modelRoute(childId)
    expect(side?.kind).toBe('feature')
    if (side?.kind !== 'feature') throw new Error('Side Chat did not install its feature model route')
    await expect(side.inspect()).resolves.toEqual({
      ok: true,
      value: { current: { provider: 'owned', model: 'parent' }, routable: true },
    })
    expect(fetches[0]).toEqual({
      method: 'sidechat.model',
      body: { childId, parentSessionId: parentId, provisional: true },
    })
    expect(side?.selectModel).toBeTypeOf('function')
    await expect(side.selectModel({ provider: 'owned', model: 'child' })).resolves.toEqual({
      ok: true,
      value: { selected: { provider: 'owned', model: 'child' } },
    })
    expect(fetches.some(call => call.method === 'sidechat.selectModel')).toBe(true)
    expect(api.callsOf('session.selectModel')).toEqual([])

    await svc.binding(childId)!.session.prompt([{ type: 'text', text: 'publish' }], 'queue')
    await expect(side.inspect()).resolves.toMatchObject({ ok: true })
    expect(fetches.at(-1)).toEqual({
      method: 'sidechat.model',
      body: { childId, parentSessionId: parentId },
    })

    const stock = svc.modelRoute(ordinaryId)
    expect(stock?.kind).toBe('stock')
    expect(stock?.inspect).toBeUndefined()
    await expect(stock!.selectModel!({ provider: 'fixture', model: 'fixture' })).resolves.toMatchObject({
      ok: true,
    })
    expect(api.callsOf('session.selectModel')).toEqual([{
      sessionId: ordinaryId,
      provider: 'fixture',
      model: 'fixture',
    }])
  })
})
