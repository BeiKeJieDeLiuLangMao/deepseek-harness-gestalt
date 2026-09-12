// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import type {
  SessionAdmissionAdapter, SessionAdmissionRoute, SessionLiveEventEntry,
} from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { EMPTY_CHAT_SNAPSHOT } from '@deepseek-ai/dsh-client-ui-chat/client'
import { EMPTY_CONVERSATION_SNAPSHOT } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { MainPanelId, PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import {
  bindSnapshotSelector,
  chatSnapshot,
  conversationSnapshot,
  inputActions,
  inputState,
  SlotTestRuntime,
  usePinnedBrowserLanguages,
} from '../src/index.ts'

const originalLanguages = [...navigator.languages]
const originalLanguage = navigator.language

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'trt.panel-info': { kind: 'keyed'; scope: 'root'; owner: { label: string } }
  }
}

usePinnedBrowserLanguages('zh-CN', 'en-US')
afterEach(cleanup)
afterAll(() => {
  expect(navigator.languages).toEqual(originalLanguages)
  expect(navigator.language).toBe(originalLanguage)
})

function entry(seq: number): SessionLiveEventEntry {
  return {
    type: 'event',
    event: {
      type: 'fixture/event',
      seq,
      time: seq,
      data: { seq },
      ignorable: true,
    } as unknown as SessionLiveEventEntry['event'],
  }
}

describe('fixture helpers', () => {
  it.each([false, true])('retracts default root sources without removing replacements (release first: %s)', async (releaseFirst) => {
    const runtime = await SlotTestRuntime.create()
    const hooks = { workspaces: runtime.workspaces.list, panelInfo: runtime.panelInfo }
    let releaseReplacement: (() => void) | undefined
    try {
      if (releaseFirst) {
        runtime.releaseWorkspaceSource()
        runtime.releasePanelInfoSource()
      } else {
        await runtime.dispose()
      }
      releaseReplacement = runtime.slots.provideRoot({ hooks })
      await runtime.dispose()
      await runtime.dispose()
      for (const key of ['workspaces', 'panelInfo'] as const) {
        expect(() => runtime.slots.provideRoot({ hooks: { [key]: hooks[key] } }))
          .toThrow(`duplicate root standard hook '${key}'`)
      }
    } finally {
      try {
        releaseReplacement?.()
        runtime.releaseWorkspaceSource()
        runtime.releasePanelInfoSource()
      } finally {
        await runtime.dispose()
      }
    }
  })

  it('drives panel hooks, retains keyed selection on owner updates, and releases the default source', async () => {
    const runtime = await SlotTestRuntime.create()
    try {
      await runtime.declare({ 'trt.panel-info': { kind: 'keyed', scope: 'root' } })
      runtime.slots.register({ name: 'trt.panel-info', key: 'probe' },
        ({ usePanelInfo, label }: PropsRuntime<'trt.panel-info'>) => (
          <span>{label}:{usePanelInfo(info => info.activePanelId) ?? 'conversation'}</span>
        ))
      const view = runtime.renderSlot('trt.panel-info', { label: 'first' }, { entryKey: 'probe' })
      expect(view.container.textContent).toBe('first:conversation')
      act(() => { runtime.panelInfo.set({ activePanelId: 'custom' as MainPanelId }) })
      expect(view.container.textContent).toBe('first:custom')
      view.update({ label: 'next' })
      expect(view.container.textContent).toBe('next:custom')
      const replacement = createSnapshotStore<PanelInfo>({ activePanelId: null })
      await act(async () => {
        runtime.releasePanelInfoSource()
        await runtime.mount({
          inject: ['slots'],
          apply(ctx) { ctx.slots.provideRoot({ hooks: { panelInfo: replacement } }) },
        })
      })
      expect(view.container.textContent).toBe('next:conversation')
    } finally {
      await runtime.dispose()
    }
  })

  it('rejects an upload until a suite replaces the default stub', async () => {
    const runtime = await SlotTestRuntime.create()
    expect(runtime.fileUpload.available).toBe(false)
    await expect(runtime.fileUpload.upload('fixture-session' as SessionId)).rejects.toThrow('file upload is not stubbed')
    await runtime.dispose()
  })

  it('builds independent Conversation and Chat snapshots with optional overrides', () => {
    const conversation = conversationSnapshot()
    expect(conversation).toEqual(EMPTY_CONVERSATION_SNAPSHOT)
    expect(conversation).not.toBe(EMPTY_CONVERSATION_SNAPSHOT)
    const activeTargets = new Set(['chat'])
    expect(conversationSnapshot({ activeTargets }).activeTargets).toBe(activeTargets)

    const chat = chatSnapshot()
    expect(chat).toEqual(EMPTY_CHAT_SNAPSHOT)
    expect(chat).not.toBe(EMPTY_CHAT_SNAPSHOT)
    const order = ['node-1']
    expect(chatSnapshot({ order }).order).toBe(order)
  })

  it('binds an observable snapshot through the production selector hook', () => {
    const source = createSnapshotStore({ value: 1 })
    const useValue = bindSnapshotSelector(source)
    const view = renderHook(() => useValue(snapshot => snapshot.value))
    expect(view.result.current).toBe(1)

    act(() => { source.update((draft) => { draft.value = 2 }) })
    expect(view.result.current).toBe(2)
  })

  it('pins both browser language fields for the calling suite', () => {
    expect(navigator.languages).toEqual(['zh-CN', 'en-US'])
    expect(navigator.language).toBe('zh-CN')
  })

  it('builds fresh complete input state and fail-loud overridable actions', () => {
    const first = inputState()
    const second = inputState({ draft: 'hello', annotations: [] })
    expect(first).toEqual({
      draft: '',
      attachmentIds: [],
      draftRev: 0,
      phase: 'plain',
      occurrences: [],
      queue: [],
      annotations: [],
    })
    expect(second.draft).toBe('hello')
    expect(second.attachmentIds).not.toBe(first.attachmentIds)
    expect(second.annotations).not.toBe(first.annotations)

    const addAttachments = vi.fn(() => true)
    const actions = inputActions({ addAttachments })
    expect(actions.addAttachments([])).toBe(true)
    expect(addAttachments).toHaveBeenCalledWith([])
    expect(() => { actions.submit() }).toThrow('test input action "submit" is not stubbed')
  })
})

describe('Session fixture lifecycle', () => {
  it('initializes and drives complete event windows through replace, prepend, and append', async () => {
    const runtime = await SlotTestRuntime.create()
    const first = entry(1)
    const older = entry(0)
    const live = entry(2)

    await runtime.sessions.add({ id: 'events', events: [first] }, { current: false })
    expect(runtime.sessions.behavior('events').eventSource.getSnapshot()).toMatchObject({
      entries: [first],
      hasMore: false,
      change: { kind: 'replace', entries: [first] },
    })

    await runtime.sessions.add({ id: 'has-more', hasMore: true }, { current: false })
    expect(runtime.sessions.behavior('has-more').eventSource.getSnapshot()).toMatchObject({
      entries: [],
      hasMore: true,
    })

    await runtime.sessions.replaceEvents('events', [first])
    await runtime.sessions.prependEvents('events', [older])
    await runtime.sessions.appendEvent('events', live)
    expect(runtime.sessions.behavior('events').eventSource.getSnapshot()).toMatchObject({
      entries: [older, first, live],
      hasMore: false,
      change: { kind: 'append', entries: [live] },
    })
    await runtime.dispose()
  })

  it('requires an explicit create stub and records successful create and refresh calls', async () => {
    const runtime = await SlotTestRuntime.create()
    await expect(runtime.sessions.create()).rejects.toThrow(/create is not stubbed/)
    await runtime.sessions.add({ id: 'created' }, { current: false })
    const create = vi.fn(() => Promise.resolve('created' as SessionId))
    runtime.sessions.stubCreate(create)

    await expect(runtime.sessions.create({ cwd: '/workspace' })).resolves.toBe('created')
    await expect(runtime.sessions.refresh()).resolves.toBeUndefined()
    expect(create).toHaveBeenCalledWith({ cwd: '/workspace' })
    expect(runtime.sessions.calls.slice(-2)).toEqual([
      { method: 'create', args: [{ cwd: '/workspace' }] },
      { method: 'refresh', args: [] },
    ])
    await runtime.dispose()
  })

  it('stages a provisional identity with a resolvable stable binding and releases it', async () => {
    const runtime = await SlotTestRuntime.create()
    await runtime.sessions.add({ id: 'parent' }, { current: true })
    const current = runtime.sessions.list.getSnapshot().current
    const release = runtime.sessions.stageProvisional({
      sessionId: 'draft' as SessionId,
      parentSessionId: 'parent' as SessionId,
      origin: 'subagent',
      title: 'Side: New thread',
    })
    const binding = runtime.sessions.binding('draft')
    expect(runtime.sessions.behavior('draft').sessionId).toBe('draft')
    expect(binding?.sessionId).toBe('draft')
    expect(runtime.sessions.scope('draft')).toBe(binding?.ctx)
    expect(runtime.sessions.sessionOf(binding!.ctx)).toBe(binding?.session)
    expect(runtime.sessions.binding('draft')).toBe(binding)
    expect(runtime.sessions.list.getSnapshot().current).toBe(current)
    expect(runtime.sessions.list.getSnapshot().byId['draft' as SessionId]).toMatchObject({
      displayTitle: 'Side: New thread', blank: true, provisional: true,
    })
    release()
    expect(runtime.sessions.binding('draft')).toBeUndefined()
    expect(runtime.sessions.scope('draft')).toBeUndefined()
    expect(runtime.sessions.list.getSnapshot().byId['draft' as SessionId]).toBeUndefined()
    await runtime.dispose()
  })

  it('does not let a provisional disposer remove a published fixture identity', async () => {
    const runtime = await SlotTestRuntime.create()
    await runtime.sessions.add({ id: 'parent' }, { current: false })
    const release = runtime.sessions.stageProvisional({
      sessionId: 'draft' as SessionId,
      parentSessionId: 'parent' as SessionId,
      origin: 'subagent',
      title: 'Side: New thread',
    })
    const binding = runtime.sessions.binding('draft')
    await runtime.sessions.updateSummary('draft', { blank: false, provisional: undefined })
    release()
    expect(runtime.sessions.binding('draft')).toBe(binding)
    expect(runtime.sessions.list.getSnapshot().byId['draft' as SessionId]?.provisional).toBeUndefined()
    expect(runtime.sessions.list.getSnapshot().byId['draft' as SessionId]?.blank).toBe(false)
    await runtime.dispose()
  })

  it('disposes a scope without materializing a binding', async () => {
    const runtime = await SlotTestRuntime.create()
    await runtime.sessions.add({ id: 'scope-only' }, { current: false })
    const scope = runtime.sessions.scope('scope-only')
    expect(scope).toBeDefined()
    const release = vi.fn()
    scope?.effect(() => release, 'fixture scope release')

    runtime.releaseWorkspaceSource()
    await runtime.dispose()
    expect(release).toHaveBeenCalledOnce()
  })

  it('registers, replaces, and revokes exact admission routes with token-safe disposers', async () => {
    const runtime = await SlotTestRuntime.create()
    const sessionId = await runtime.sessions.add({ id: 'admitted' }, { current: false })
    const parentId = await runtime.sessions.add({ id: 'parent' }, { current: false })
    const changed = vi.fn()
    const unsubscribe = runtime.sessions.subscribeAdmission(changed)
    const first: SessionAdmissionRoute = {
      prompt: async () => ({ ok: true, value: { accepted: true } }),
      cancel: async () => ({ ok: true, value: { accepted: true } }),
      commandCatalogSessionId: () => parentId,
      skillCatalogSessionId: () => parentId,
    }
    const selected = { provider: 'fixture', model: 'replacement' }
    const second: SessionAdmissionRoute = {
      prompt: async () => ({ ok: true, value: { accepted: true } }),
      cancel: async () => ({ ok: true, value: { accepted: true } }),
      modelRoute: () => ({
        inspect: async () => ({
          ok: true,
          value: { current: selected, routable: true },
        }),
        selectModel: async () => ({ ok: true, value: { selected } }),
      }),
    }

    const dropFirst = runtime.sessions.registerAdmission(sessionId, first)
    expect(runtime.sessions.commandCatalogSessionId(sessionId)).toBe(parentId)
    expect(runtime.sessions.skillCatalogSessionId(sessionId)).toBe(parentId)
    expect(changed).toHaveBeenCalledTimes(1)

    const dropSecond = runtime.sessions.registerAdmission(sessionId, second)
    expect(runtime.sessions.modelRoute(sessionId)?.kind).toBe('feature')
    expect(runtime.sessions.commandCatalogSessionId(sessionId)).toBeUndefined()
    expect(runtime.sessions.skillCatalogSessionId(sessionId)).toBeUndefined()
    await expect(runtime.sessions.modelRoute(sessionId)?.selectModel?.(selected)).resolves.toEqual({
      ok: true,
      value: { selected },
    })
    expect(changed).toHaveBeenCalledTimes(2)

    dropFirst()
    expect(runtime.sessions.modelRoute(sessionId)).toBeDefined()
    expect(changed).toHaveBeenCalledTimes(2)
    dropSecond()
    expect(runtime.sessions.modelRoute(sessionId)?.kind).toBe('stock')
    expect(runtime.sessions.modelRoute(sessionId)?.inspect).toBeUndefined()
    expect(runtime.sessions.modelRoute(sessionId)?.selectModel).toBeTypeOf('function')
    expect(runtime.sessions.commandCatalogSessionId(sessionId)).toBe(sessionId)
    expect(changed).toHaveBeenCalledTimes(3)
    unsubscribe()
    await runtime.dispose()
  })

  it('matches production model-route availability while stock selection stays fail-loud', async () => {
    const runtime = await SlotTestRuntime.create()
    const ordinary = await runtime.sessions.add({ id: 'ordinary' }, { current: false })
    const subagent = await runtime.sessions.add({
      id: 'subagent',
      summary: { origin: 'subagent', parentId: ordinary },
    }, { current: false })

    const stock = runtime.sessions.modelRoute(ordinary)
    expect(stock?.kind).toBe('stock')
    expect(stock?.inspect).toBeUndefined()
    expect(stock?.selectModel).toBeTypeOf('function')
    await expect(stock?.selectModel?.({ provider: 'fixture', model: 'fixture' })).rejects.toThrow(
      'stock model route "selectModel" is not stubbed for session "ordinary"',
    )
    expect(runtime.sessions.modelRoute('unknown' as SessionId)).toBeUndefined()
    expect(runtime.sessions.modelRoute(subagent)).toBeUndefined()

    const route: SessionAdmissionRoute = {
      prompt: async () => ({ ok: true, value: { accepted: true } }),
      cancel: async () => ({ ok: true, value: { accepted: true } }),
    }
    const dropOmitted = runtime.sessions.registerAdmission(ordinary, route)
    expect(runtime.sessions.modelRoute(ordinary)?.selectModel).toBeTypeOf('function')
    dropOmitted()

    const dropHidden = runtime.sessions.registerAdmission(ordinary, {
      ...route,
      modelRoute: () => undefined,
    })
    expect(runtime.sessions.modelRoute(ordinary)).toBeUndefined()
    dropHidden()
    expect(runtime.sessions.modelRoute(ordinary)?.selectModel).toBeTypeOf('function')
    await runtime.dispose()
  })

  it('orders adapters behind exact routes and disposes them by registration identity', async () => {
    const runtime = await SlotTestRuntime.create()
    const sessionId = await runtime.sessions.add({ id: 'adapter' }, { current: false })
    const parentId = await runtime.sessions.add({ id: 'adapter-parent' }, { current: false })
    const adapter: SessionAdmissionAdapter = {
      id: 'fixture-adapter',
      handles: id => id === sessionId,
      prompt: async () => ({ ok: true, value: { accepted: true } }),
      cancel: async () => ({ ok: true, value: { accepted: true } }),
      commandCatalogSessionId: () => parentId,
    }
    const dropAdapter = runtime.sessions.registerAdmissionAdapter(adapter)
    expect(runtime.sessions.commandCatalogSessionId(sessionId)).toBe(parentId)
    expect(() => { runtime.sessions.registerAdmissionAdapter(adapter) })
      .toThrow('duplicate admission adapter "fixture-adapter"')

    const route: SessionAdmissionRoute = {
      prompt: async () => ({ ok: true, value: { accepted: true } }),
      cancel: async () => ({ ok: true, value: { accepted: true } }),
      commandCatalogSessionId: () => sessionId,
    }
    const dropExact = runtime.sessions.registerAdmission(sessionId, route)
    expect(runtime.sessions.commandCatalogSessionId(sessionId)).toBe(sessionId)
    dropExact()
    expect(runtime.sessions.commandCatalogSessionId(sessionId)).toBe(parentId)
    dropAdapter()
    expect(runtime.sessions.commandCatalogSessionId(sessionId)).toBe(sessionId)
    await runtime.dispose()
  })
})
