/**
 * Side Chat product adapter on live ClientSessions: installSidechatAdmission
 * (the same registration `apply` uses) routes canonical Session.prompt /
 * cancel / updateQueue through Host sidechat JSON, never by title, and never
 * through stock session.prompt.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MessageId, SessionId } from '@deepseek-ai/dsh-session/types'
import { ClientSessions } from '../../../api/session-controller/src/client/sessions/service.ts'
import {
  FakeApiClient,
  fakeRemote,
  ok,
} from '../../../api/session-controller/tests/fake-api.client.ts'
import { registerSidechatDraft } from '../src/client/api.ts'
import { installSidechatAdmission } from '../src/client/sidechat-admission.ts'
import type { Context as SidebarContext } from '../src/context-types.ts'
import { SIDE_LABEL_PREFIX } from '../src/sidechat-core.ts'

const sid = (value: string): SessionId => value as SessionId
const mid = (value: string): MessageId => value as MessageId

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
    )

    expect(result).toEqual({ ok: true, value: { accepted: true } })
    expect(fetches).toEqual([{
      method: 'sidechat.start',
      body: { sessionId: parentId, childId, text: 'first question' },
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
})
